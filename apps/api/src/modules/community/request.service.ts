/**
 * Community requests and owner offers.
 *
 * A request shows what is needed, an approximate neighborhood and dates. An
 * owner offers one of their own published listings. Choosing an offer opens
 * the normal booking review with the dates prefilled; nothing is reserved by
 * the offer. The request becomes fulfilled when a booking is created from the
 * chosen offer (in the booking transaction). Closed or fulfilled requests keep
 * their offers and any bookings.
 */

import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  BOOKING_CONFIG,
  DAY_MS,
  DEFAULT_NOTIFICATION_PREFERENCES,
  TRUST_CONFIG,
  normalizeIso,
  toMillis,
  type CreateOfferBody,
  type CreateRequestBody,
  type OfferSelectionDto,
  type RequestOfferDto,
  type RequestPostDto,
  type UpdateRequestBody,
} from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from "../../common/errors/api-exceptions.js";
import type { ListingDocument } from "../listings/listing.repository.js";
import type { NotificationDoc } from "../exchange/exchange.types.js";
import { MemberDirectory } from "../exchange/member-directory.service.js";

export interface RequestPostDoc {
  id: string;
  authorUid: string;
  title: string;
  description: string;
  categoryId: string;
  neighborhoodId: string;
  desiredStartAt: string;
  desiredEndAt: string;
  maxDailyRateHalalas: number | null;
  status: "open" | "fulfilled" | "closed" | "expired";
  offerCount: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  fulfilledBookingId?: string | null;
}

export interface RequestOfferDoc {
  id: string;
  requestPostId: string;
  ownerUid: string;
  listingId: string;
  message: string;
  status: "offered" | "selected" | "withdrawn";
  bookingId: string | null;
  createdAt: string;
  updatedAt: string;
}

export const offerId = (requestPostId: string, listingId: string) => `${requestPostId}_${listingId}`;

function checkDates(startAt: string, endAt: string): void {
  const start = toMillis(startAt);
  const end = toMillis(endAt);
  if (end <= start) throw new ValidationException([{ field: "desiredEndAt", message: "The end must be after the start" }]);
  if (start <= Date.now()) throw new ValidationException([{ field: "desiredStartAt", message: "Choose dates in the future" }]);
  if (start > Date.now() + BOOKING_CONFIG.maxHorizonDays * DAY_MS) {
    throw new ValidationException([
      { field: "desiredStartAt", message: `Dates can be at most ${BOOKING_CONFIG.maxHorizonDays} days ahead` },
    ]);
  }
}

/** An open request whose dates have passed counts as expired. */
function effectiveStatus(doc: RequestPostDoc): RequestPostDoc["status"] {
  return doc.status === "open" && toMillis(doc.desiredEndAt) <= Date.now() ? "expired" : doc.status;
}

@Injectable()
export class RequestService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly members: MemberDirectory,
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  private ref(id: string) {
    return this.db.collection(COLLECTIONS.requestPosts).doc(id);
  }

  private offerRef(id: string) {
    return this.db.collection(COLLECTIONS.requestOffers).doc(id);
  }

  private async load(id: string): Promise<RequestPostDoc> {
    const doc = (await this.ref(id).get()).data() as RequestPostDoc | undefined;
    if (!doc) throw new NotFoundException("Request not found");
    return { ...doc, status: effectiveStatus(doc) };
  }

  private async neighborhoodNames(ids: string[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const snaps = await this.db.getAll(...unique.map((n) => this.db.collection(COLLECTIONS.neighborhoods).doc(n)));
    return new Map(snaps.map((s) => [s.id, (s.data()?.["nameEn"] as string) ?? ""]));
  }

  private async toDtos(docs: RequestPostDoc[]): Promise<RequestPostDto[]> {
    const [names, hoods] = await Promise.all([
      this.members.displayNames(docs.map((d) => d.authorUid)),
      this.neighborhoodNames(docs.map((d) => d.neighborhoodId)),
    ]);
    return docs.map((d) => ({
      id: d.id,
      authorUid: d.authorUid,
      authorName: names.get(d.authorUid) ?? "Member",
      title: d.title,
      description: d.description,
      categoryId: d.categoryId,
      neighborhoodId: d.neighborhoodId,
      neighborhoodName: hoods.get(d.neighborhoodId) ?? "",
      desiredStartAt: d.desiredStartAt,
      desiredEndAt: d.desiredEndAt,
      maxDailyRateHalalas: d.maxDailyRateHalalas,
      status: effectiveStatus(d),
      offerCount: d.offerCount,
      revision: d.revision,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
    }));
  }

  /** GET /requests — open requests only (public, approximate details). */
  async listOpen(): Promise<RequestPostDto[]> {
    const snap = await this.db.collection(COLLECTIONS.requestPosts).where("status", "==", "open").get();
    const docs = snap.docs
      .map((d) => d.data() as RequestPostDoc)
      .filter((d) => effectiveStatus(d) === "open")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 100);
    return this.toDtos(docs);
  }

  async listMine(uid: string): Promise<RequestPostDto[]> {
    const snap = await this.db.collection(COLLECTIONS.requestPosts).where("authorUid", "==", uid).get();
    const docs = snap.docs.map((d) => d.data() as RequestPostDoc).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return this.toDtos(docs);
  }

  /** GET /requests/:id — request with its current offers (withdrawn ones hidden). */
  async get(id: string): Promise<RequestPostDto> {
    const doc = await this.load(id);
    const [dto] = await this.toDtos([doc]);
    const offersSnap = await this.db.collection(COLLECTIONS.requestOffers).where("requestPostId", "==", id).get();
    const offers = offersSnap.docs
      .map((d) => d.data() as RequestOfferDoc)
      .filter((o) => o.status !== "withdrawn")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const listings = offers.length
      ? await this.db.getAll(...offers.map((o) => this.db.collection(COLLECTIONS.listings).doc(o.listingId)))
      : [];
    const owners = await this.members.displayNames(offers.map((o) => o.ownerUid));
    dto!.offers = offers.map((o, i): RequestOfferDto => {
      const l = listings[i]?.data() as ListingDocument | undefined;
      const isPublic = l?.status === "published";
      return {
        id: o.id,
        requestPostId: o.requestPostId,
        ownerUid: o.ownerUid,
        ownerName: owners.get(o.ownerUid) ?? "Member",
        listingId: o.listingId,
        listing: l
          ? {
              titleEn: l.titleEn,
              isPublic,
              lendingMode: l.lendingMode,
              dailyRateHalalas: l.dailyRateHalalas,
              depositHalalas: l.depositHalalas,
              primaryMediaId: isPublic ? l.primaryMediaId : null,
            }
          : null,
        message: o.message,
        status: o.status,
        bookingId: o.bookingId,
        createdAt: o.createdAt,
      };
    });
    return dto!;
  }

  async create(uid: string, body: CreateRequestBody): Promise<RequestPostDto> {
    const profile = await this.members.profile(uid);
    if (!profile?.completedProfile) throw new ForbiddenException("Complete your profile before posting a request.");
    checkDates(body.desiredStartAt, body.desiredEndAt);
    const open = (await this.db.collection(COLLECTIONS.requestPosts).where("authorUid", "==", uid).where("status", "==", "open").get())
      .docs.map((d) => d.data() as RequestPostDoc)
      .filter((d) => effectiveStatus(d) === "open");
    if (open.length >= TRUST_CONFIG.maxOpenRequestsPerMember) {
      throw new ConflictException(`You can have at most ${TRUST_CONFIG.maxOpenRequestsPerMember} open requests.`);
    }
    const now = new Date().toISOString();
    const doc: RequestPostDoc = {
      id: `req_${randomUUID()}`,
      authorUid: uid,
      title: body.title,
      description: body.description ?? "",
      categoryId: body.categoryId,
      neighborhoodId: body.neighborhoodId,
      desiredStartAt: normalizeIso(body.desiredStartAt),
      desiredEndAt: normalizeIso(body.desiredEndAt),
      maxDailyRateHalalas: body.maxDailyRateHalalas ?? null,
      status: "open",
      offerCount: 0,
      revision: 0,
      createdAt: now,
      updatedAt: now,
      fulfilledBookingId: null,
    };
    await this.ref(doc.id).set(doc);
    return (await this.toDtos([doc]))[0]!;
  }

  async update(uid: string, id: string, body: UpdateRequestBody): Promise<RequestPostDto> {
    const doc = await this.db.runTransaction(async (tx) => {
      const current = (await tx.get(this.ref(id))).data() as RequestPostDoc | undefined;
      if (!current || current.authorUid !== uid) throw new NotFoundException("Request not found");
      if (effectiveStatus(current) !== "open") throw new ConflictException("Only open requests can be edited.");
      if (current.revision !== body.expectedRevision) {
        throw new ConflictException("This request changed. Refresh and try again.", { reason: "stale_revision" });
      }
      const next: RequestPostDoc = {
        ...current,
        title: body.title ?? current.title,
        description: body.description ?? current.description,
        categoryId: body.categoryId ?? current.categoryId,
        neighborhoodId: body.neighborhoodId ?? current.neighborhoodId,
        desiredStartAt: body.desiredStartAt ? normalizeIso(body.desiredStartAt) : current.desiredStartAt,
        desiredEndAt: body.desiredEndAt ? normalizeIso(body.desiredEndAt) : current.desiredEndAt,
        maxDailyRateHalalas:
          body.maxDailyRateHalalas !== undefined ? body.maxDailyRateHalalas : current.maxDailyRateHalalas,
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      if (body.desiredStartAt || body.desiredEndAt) checkDates(next.desiredStartAt, next.desiredEndAt);
      tx.set(this.ref(id), next);
      return next;
    });
    return (await this.toDtos([doc]))[0]!;
  }

  async close(uid: string, id: string): Promise<RequestPostDto> {
    const doc = await this.db.runTransaction(async (tx) => {
      const current = (await tx.get(this.ref(id))).data() as RequestPostDoc | undefined;
      if (!current || current.authorUid !== uid) throw new NotFoundException("Request not found");
      if (current.status !== "open") return current;
      const next: RequestPostDoc = {
        ...current,
        status: "closed",
        revision: current.revision + 1,
        updatedAt: new Date().toISOString(),
      };
      tx.set(this.ref(id), next);
      return next;
    });
    return (await this.toDtos([doc]))[0]!;
  }

  // ─── Offers ───

  /** Owner offers one of their own published listings. */
  async offer(uid: string, requestId: string, body: CreateOfferBody): Promise<RequestPostDto> {
    const request = await this.load(requestId);
    if (request.status !== "open") throw new ConflictException("This request is no longer open.");
    if (request.authorUid === uid) {
      throw new ValidationException([{ field: "listingId", message: "You cannot offer to your own request." }]);
    }
    const listing = (await this.db.collection(COLLECTIONS.listings).doc(body.listingId).get()).data() as
      | ListingDocument
      | undefined;
    if (!listing || listing.ownerUid !== uid) {
      throw new ForbiddenException("You can only offer one of your own listings.");
    }
    if (listing.status !== "published") {
      throw new ConflictException("Publish this listing before offering it.");
    }
    const ownerName = await this.members.displayName(uid);
    const author = await this.members.profile(request.authorUid);
    const notifyAuthor = (author?.notificationPreferences ?? DEFAULT_NOTIFICATION_PREFERENCES).community;

    await this.db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      const current = (await tx.get(this.ref(requestId))).data() as RequestPostDoc;
      const id = offerId(requestId, body.listingId);
      const existing = (await tx.get(this.offerRef(id))).data() as RequestOfferDoc | undefined;
      if (effectiveStatus(current) !== "open") throw new ConflictException("This request is no longer open.");
      if (existing && existing.status !== "withdrawn") {
        throw new ConflictException("You have already offered this item.", { reason: "already_offered" });
      }
      const offer: RequestOfferDoc = {
        id,
        requestPostId: requestId,
        ownerUid: uid,
        listingId: body.listingId,
        message: body.message ?? "",
        status: "offered",
        bookingId: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      tx.set(this.offerRef(id), offer);
      tx.set(this.ref(requestId), { ...current, offerCount: current.offerCount + 1, updatedAt: now });
      if (notifyAuthor) {
        const n: NotificationDoc = {
          id: `ntf_offer_${id}_${now.replace(/[-:.TZ]/g, "")}`,
          recipientUid: current.authorUid,
          type: "offer_received",
          entityType: "request",
          entityId: requestId,
          title: "New offer for your request",
          body: `${ownerName} offered ${listing.titleEn} for "${current.title}".`,
          actionPath: `/requests/${requestId}`,
          createdAt: now,
          readAt: null,
        };
        tx.set(this.db.collection(COLLECTIONS.notifications).doc(n.id), n);
      }
    });
    return this.get(requestId);
  }

  /** Author chooses an offer: returns the booking review to open; nothing is reserved. */
  async select(uid: string, requestId: string, offerIdValue: string): Promise<OfferSelectionDto> {
    const request = await this.load(requestId);
    if (request.authorUid !== uid) throw new NotFoundException("Request not found");
    if (request.status !== "open") throw new ConflictException("This request is no longer open.");
    const offer = (await this.offerRef(offerIdValue).get()).data() as RequestOfferDoc | undefined;
    if (!offer || offer.requestPostId !== requestId || offer.status === "withdrawn") {
      throw new NotFoundException("Offer not found");
    }
    const listing = (await this.db.collection(COLLECTIONS.listings).doc(offer.listingId).get()).data() as
      | ListingDocument
      | undefined;
    if (!listing || listing.status !== "published") {
      throw new ConflictException("The offered item is not available any more.");
    }
    const now = new Date().toISOString();
    if (offer.status !== "selected") {
      await this.offerRef(offer.id).set({ ...offer, status: "selected", updatedAt: now });
      const owner = await this.members.profile(offer.ownerUid);
      if ((owner?.notificationPreferences ?? DEFAULT_NOTIFICATION_PREFERENCES).community) {
        const n: NotificationDoc = {
          id: `ntf_offer_${offer.id}_selected`,
          recipientUid: offer.ownerUid,
          type: "offer_selected",
          entityType: "request",
          entityId: requestId,
          title: "Your offer was chosen",
          body: `Your offer of ${listing.titleEn} was chosen. A booking request may follow; nothing is reserved yet.`,
          actionPath: `/requests/${requestId}`,
          createdAt: now,
          readAt: null,
        };
        await this.db.collection(COLLECTIONS.notifications).doc(n.id).set(n);
      }
    }
    const query = new URLSearchParams({
      from: request.desiredStartAt,
      to: request.desiredEndAt,
      offer: offer.id,
    });
    return {
      offerId: offer.id,
      listingId: offer.listingId,
      startAt: request.desiredStartAt,
      endAt: request.desiredEndAt,
      reviewPath: `/items/${offer.listingId}?${query.toString()}`,
    };
  }

  async withdraw(uid: string, requestId: string, offerIdValue: string): Promise<RequestPostDto> {
    await this.db.runTransaction(async (tx) => {
      const offer = (await tx.get(this.offerRef(offerIdValue))).data() as RequestOfferDoc | undefined;
      const request = (await tx.get(this.ref(requestId))).data() as RequestPostDoc | undefined;
      if (!offer || offer.ownerUid !== uid || offer.requestPostId !== requestId || !request) {
        throw new NotFoundException("Offer not found");
      }
      if (offer.status === "withdrawn") return;
      if (offer.bookingId) throw new ConflictException("A booking was already made from this offer.");
      const now = new Date().toISOString();
      tx.set(this.offerRef(offer.id), { ...offer, status: "withdrawn", updatedAt: now });
      tx.set(this.ref(requestId), { ...request, offerCount: Math.max(0, request.offerCount - 1), updatedAt: now });
    });
    return this.get(requestId);
  }
}
