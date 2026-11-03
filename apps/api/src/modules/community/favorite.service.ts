/**
 * Favorites and availability alerts.
 *
 * Saving never reserves. A favorite with desired dates and alerts on gets at
 * most one alert per availability revision of the listing: when a transaction
 * releases a reservation or owner block that overlaps the desired dates, the
 * dates are checked against current availability and, only if they are now
 * bookable, one in-app notification is written (deterministic id).
 */

import { Injectable, OnModuleInit } from "@nestjs/common";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  intervalsOverlap,
  normalizeIso,
  type FavoriteDto,
  type SaveFavoriteBody,
} from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import { NotFoundException, ValidationException } from "../../common/errors/api-exceptions.js";
import type { ListingDocument } from "../listings/listing.repository.js";
import { PublicListingRepository } from "../listings/public-listing.repository.js";
import {
  CalendarGuardService,
  type AvailabilityReleaseEvent,
} from "../exchange/calendar-guard.service.js";
import { MemberDirectory } from "../exchange/member-directory.service.js";
import type { NotificationDoc } from "../exchange/exchange.types.js";
import { formatRiyadh } from "../../common/format.js";

export interface FavoriteDoc {
  id: string;
  userUid: string;
  listingId: string;
  createdAt: string;
  updatedAt: string;
  alertEnabled: boolean;
  desiredStartAt: string | null;
  desiredEndAt: string | null;
  lastAlertedRevision: number;
}

export const favoriteId = (uid: string, listingId: string) => `${uid}_${listingId}`;

@Injectable()
export class FavoriteService implements OnModuleInit {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly calendar: CalendarGuardService,
    private readonly catalogue: PublicListingRepository,
    private readonly members: MemberDirectory,
  ) {}

  onModuleInit(): void {
    this.calendar.onAvailabilityReleased((event) => this.onRelease(event));
  }

  private get db() {
    return this.firebase.firestore;
  }

  private ref(id: string) {
    return this.db.collection(COLLECTIONS.favorites).doc(id);
  }

  private async listing(id: string): Promise<ListingDocument | null> {
    const snap = await this.db.collection(COLLECTIONS.listings).doc(id).get();
    return snap.exists ? (snap.data() as ListingDocument) : null;
  }

  /** PUT /me/favorites/:listingId — save or update alert settings. */
  async save(uid: string, listingId: string, body: SaveFavoriteBody): Promise<FavoriteDto> {
    const listing = await this.listing(listingId);
    const existing = (await this.ref(favoriteId(uid, listingId)).get()).data() as FavoriteDoc | undefined;
    if (!listing || (listing.status !== "published" && !existing)) throw new NotFoundException("Item not found");
    if (listing.ownerUid === uid) {
      throw new ValidationException([{ field: "listingId", message: "This is your own item." }]);
    }
    const now = new Date().toISOString();
    const doc: FavoriteDoc = {
      id: favoriteId(uid, listingId),
      userUid: uid,
      listingId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      alertEnabled: body.alertEnabled,
      desiredStartAt: body.desiredStartAt ? normalizeIso(body.desiredStartAt) : null,
      desiredEndAt: body.desiredEndAt ? normalizeIso(body.desiredEndAt) : null,
      // Changing the dates starts a fresh alert history.
      lastAlertedRevision:
        existing &&
        existing.desiredStartAt === (body.desiredStartAt ? normalizeIso(body.desiredStartAt) : null) &&
        existing.desiredEndAt === (body.desiredEndAt ? normalizeIso(body.desiredEndAt) : null)
          ? existing.lastAlertedRevision
          : 0,
    };
    await this.ref(doc.id).set(doc);
    return (await this.toDtos([doc]))[0]!;
  }

  async remove(uid: string, listingId: string): Promise<void> {
    await this.ref(favoriteId(uid, listingId)).delete();
  }

  async list(uid: string): Promise<FavoriteDto[]> {
    const snap = await this.db.collection(COLLECTIONS.favorites).where("userUid", "==", uid).get();
    const docs = snap.docs.map((d) => d.data() as FavoriteDoc).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return this.toDtos(docs);
  }

  private async toDtos(docs: FavoriteDoc[]): Promise<FavoriteDto[]> {
    if (docs.length === 0) return [];
    const listings = await this.db.getAll(...docs.map((d) => this.db.collection(COLLECTIONS.listings).doc(d.listingId)));
    const neighborhoodIds = [
      ...new Set(listings.map((l) => (l.data() as ListingDocument | undefined)?.neighborhoodId).filter(Boolean)),
    ] as string[];
    const hoods = neighborhoodIds.length
      ? await this.db.getAll(...neighborhoodIds.map((n) => this.db.collection(COLLECTIONS.neighborhoods).doc(n)))
      : [];
    const hoodNames = new Map(hoods.map((h) => [h.id, (h.data()?.["nameEn"] as string) ?? ""]));
    return Promise.all(
      docs.map(async (d, i) => {
        const l = listings[i]?.data() as ListingDocument | undefined;
        const isPublic = l?.status === "published";
        const availableForDates =
          l && isPublic && d.desiredStartAt && d.desiredEndAt
            ? await this.catalogue.availableFor(l, d.desiredStartAt, d.desiredEndAt, d.userUid)
            : null;
        return {
          id: d.id,
          listingId: d.listingId,
          createdAt: d.createdAt,
          alertEnabled: d.alertEnabled,
          desiredStartAt: d.desiredStartAt,
          desiredEndAt: d.desiredEndAt,
          listing: {
            titleEn: l?.titleEn ?? "Removed item",
            status: l?.status ?? "archived",
            isPublic,
            lendingMode: l?.lendingMode ?? "free",
            dailyRateHalalas: l?.dailyRateHalalas ?? 0,
            depositHalalas: l?.depositHalalas ?? 0,
            primaryMediaId: isPublic ? (l?.primaryMediaId ?? null) : null,
            neighborhoodName: l ? (hoodNames.get(l.neighborhoodId) ?? "") : "",
          },
          availableForDates,
        };
      }),
    );
  }

  /** After a committed release: alert savers whose desired dates are now free. */
  async onRelease(event: AvailabilityReleaseEvent): Promise<void> {
    const snap = await this.db
      .collection(COLLECTIONS.favorites)
      .where("listingId", "==", event.listingId)
      .where("alertEnabled", "==", true)
      .get();
    const favorites = snap.docs.map((d) => d.data() as FavoriteDoc);
    if (favorites.length === 0) return;
    const listing = await this.listing(event.listingId);
    if (!listing || listing.status !== "published") return;

    for (const fav of favorites) {
      if (!fav.desiredStartAt || !fav.desiredEndAt) continue;
      if ((fav.lastAlertedRevision ?? 0) >= event.availabilityRevision) continue;
      const desired = { startAt: fav.desiredStartAt, endAt: fav.desiredEndAt };
      if (!event.intervals.some((i) => intervalsOverlap(i, desired))) continue;
      // Recheck against current availability; still booked means no alert.
      if (!(await this.catalogue.availableFor(listing, desired.startAt, desired.endAt, fav.userUid))) continue;
      const profile = await this.members.profile(fav.userUid);
      const wantsAlerts = (profile?.notificationPreferences ?? DEFAULT_NOTIFICATION_PREFERENCES).alerts;

      await this.db.runTransaction(async (tx) => {
        const now = new Date().toISOString();
        const current = (await tx.get(this.ref(fav.id))).data() as FavoriteDoc | undefined;
        if (!current || !current.alertEnabled || (current.lastAlertedRevision ?? 0) >= event.availabilityRevision) {
          return;
        }
        tx.set(this.ref(fav.id), { ...current, lastAlertedRevision: event.availabilityRevision, updatedAt: now });
        if (wantsAlerts) {
          const notification: NotificationDoc = {
            id: `ntf_fav_${fav.id}_${event.availabilityRevision}`,
            recipientUid: fav.userUid,
            type: "availability_alert",
            entityType: "listing",
            entityId: listing.id,
            title: "A saved item is available",
            body: `${listing.titleEn} is now free for ${formatRiyadh(desired.startAt)} to ${formatRiyadh(desired.endAt)}. Saving does not reserve it.`,
            actionPath: `/items/${listing.id}?from=${encodeURIComponent(desired.startAt)}&to=${encodeURIComponent(desired.endAt)}`,
            createdAt: now,
            readAt: null,
          };
          tx.set(this.db.collection(COLLECTIONS.notifications).doc(notification.id), notification);
        }
      });
    }
  }
}
