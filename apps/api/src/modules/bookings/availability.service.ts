/**
 * Availability service — owner booking settings, owner unavailable periods
 * and the public availability view.
 *
 * Settings and block changes run through the calendar guard. The public view
 * returns merged busy intervals and the bookable window only: no reasons,
 * notes, block kinds or member identities.
 */

import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  BOOKING_CONFIG,
  addDays,
  mergeIntervals,
  normalizeIso,
  toMillis,
  type AvailabilityDto,
  type BookingSettingsBody,
  type OwnerBlockBody,
  type OwnerBlockDto,
  type OwnerCalendarDto,
} from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ValidationException,
} from "../../common/errors/api-exceptions.js";
import type { ListingDocument } from "../listings/listing.repository.js";
import { CalendarGuardService } from "../exchange/calendar-guard.service.js";
import type { AvailabilityBlockDoc } from "../exchange/exchange.types.js";
import { ids } from "../exchange/ids.js";

function toOwnerBlockDto(block: AvailabilityBlockDoc): OwnerBlockDto {
  const dto: OwnerBlockDto = {
    id: block.id,
    kind: block.kind,
    startAt: block.startAt,
    endAt: block.endAt,
    status: block.status,
    createdAt: block.createdAt,
  };
  if (block.kind === "owner" && block.note) dto.note = block.note;
  if (block.kind === "reservation") {
    dto.bookingId = block.bookingId ?? undefined;
    dto.holdExpiresAt = block.holdExpiresAt ?? null;
  }
  return dto;
}

@Injectable()
export class AvailabilityService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly calendar: CalendarGuardService,
  ) {}

  private listingRef(id: string) {
    return this.firebase.firestore.collection(COLLECTIONS.listings).doc(id);
  }

  private async getOwnedListing(listingId: string, ownerUid: string): Promise<ListingDocument> {
    const snap = await this.listingRef(listingId).get();
    const listing = snap.exists ? (snap.data() as ListingDocument) : null;
    if (!listing || listing.ownerUid !== ownerUid) {
      throw new NotFoundException("Listing not found");
    }
    return listing;
  }

  /** PATCH /me/listings/:id/booking-settings */
  async updateBookingSettings(
    listingId: string,
    ownerUid: string,
    body: BookingSettingsBody,
  ): Promise<ListingDocument> {
    await this.getOwnedListing(listingId, ownerUid);
    return this.calendar.withListingCalendar(listingId, async (scope) => {
      const listing = await scope.read<ListingDocument>(this.listingRef(listingId));
      if (!listing || listing.ownerUid !== ownerUid) {
        throw new NotFoundException("Listing not found");
      }
      if (listing.status === "archived") {
        throw new BadRequestException("Archived listings cannot take bookings");
      }
      if (listing.revision !== body.expectedRevision) {
        throw new ConflictException(
          "This listing was edited by another session. Please refresh and try again.",
        );
      }
      const updated: ListingDocument = {
        ...listing,
        bookingMode: body.bookingMode,
        bookableFrom: body.bookableFrom ? normalizeIso(body.bookableFrom) : null,
        bookableUntil: body.bookableUntil ? normalizeIso(body.bookableUntil) : null,
        revision: listing.revision + 1,
        updatedAt: scope.now,
      };
      scope.buffer.set(this.listingRef(listingId), {
        bookingMode: updated.bookingMode,
        bookableFrom: updated.bookableFrom,
        bookableUntil: updated.bookableUntil,
        revision: updated.revision,
        updatedAt: updated.updatedAt,
      }, { merge: true });
      return updated;
    });
  }

  /** GET /me/listings/:id/blocks — owner view, including private notes. */
  async getOwnerCalendar(listingId: string, ownerUid: string): Promise<OwnerCalendarDto> {
    const listing = await this.getOwnedListing(listingId, ownerUid);
    const snapshot = await this.calendar.snapshot(listingId);
    const sorted = [...snapshot.blocks].sort((a, b) => toMillis(a.startAt) - toMillis(b.startAt));
    return {
      listingId,
      bookingMode: listing.bookingMode ?? "approval",
      bookableFrom: listing.bookableFrom ?? null,
      bookableUntil: listing.bookableUntil ?? null,
      revision: listing.revision,
      itemOnHold: snapshot.onHold,
      ownerBlocks: sorted.filter((b) => b.kind === "owner").map(toOwnerBlockDto),
      reservations: sorted.filter((b) => b.kind === "reservation").map(toOwnerBlockDto),
    };
  }

  /** POST /me/listings/:id/blocks — refused over a live reservation. */
  async addOwnerBlock(
    listingId: string,
    ownerUid: string,
    body: OwnerBlockBody,
  ): Promise<OwnerBlockDto> {
    await this.getOwnedListing(listingId, ownerUid);
    const startAt = normalizeIso(body.startAt);
    const endAt = normalizeIso(body.endAt);
    if (toMillis(endAt) <= Date.now()) {
      throw new ValidationException([
        { field: "endAt", message: "An unavailable period must end in the future" },
      ]);
    }
    const blockId = body.clientRequestId
      ? ids.ownerBlock(listingId, ownerUid, body.clientRequestId)
      : `blk_${randomUUID()}`;

    return this.calendar.withListingCalendar(listingId, async (scope) => {
      const listing = await scope.read<ListingDocument>(this.listingRef(listingId));
      if (!listing || listing.ownerUid !== ownerUid) {
        throw new NotFoundException("Listing not found");
      }
      if (listing.status === "archived") {
        throw new BadRequestException("Archived listings cannot be changed");
      }
      const existing = await scope.read<AvailabilityBlockDoc>(scope.blockRef(blockId));
      if (existing) return toOwnerBlockDto(existing);

      const reservations = scope
        .conflicts({ startAt, endAt })
        .filter((b) => b.kind === "reservation");
      if (reservations.length > 0) {
        throw new ConflictException(
          "This period overlaps a reservation. Agreed bookings can only change through the booking itself.",
        );
      }
      const block: AvailabilityBlockDoc = {
        id: blockId,
        listingId,
        kind: "owner",
        startAt,
        endAt,
        status: "live",
        bookingId: null,
        holdExpiresAt: null,
        createdByUid: ownerUid,
        createdAt: scope.now,
        releasedAt: null,
        clientRequestId: body.clientRequestId ?? null,
      };
      if (body.note) block.note = body.note;
      scope.addOwnerBlock(block);
      return toOwnerBlockDto(block);
    });
  }

  /** DELETE /me/listings/:id/blocks/:blockId — releases an owner block (kept as history). */
  async removeOwnerBlock(listingId: string, ownerUid: string, blockId: string): Promise<void> {
    await this.getOwnedListing(listingId, ownerUid);
    await this.calendar.withListingCalendar(listingId, async (scope) => {
      const block = await scope.read<AvailabilityBlockDoc>(scope.blockRef(blockId));
      if (!block || block.listingId !== listingId || block.kind !== "owner" || block.status !== "live") {
        throw new NotFoundException("Unavailable period not found");
      }
      scope.releaseOwnerBlock(blockId);
    });
  }

  /** GET /listings/:id/availability — published listings only. */
  async getPublicAvailability(
    listingId: string,
    range: { from?: string; to?: string },
  ): Promise<AvailabilityDto> {
    const snap = await this.listingRef(listingId).get();
    const listing = snap.exists ? (snap.data() as ListingDocument) : null;
    if (!listing || listing.status !== "published") {
      throw new NotFoundException("Listing not found");
    }
    const now = new Date().toISOString();
    const from = range.from ? normalizeIso(range.from) : now;
    const to = range.to ? normalizeIso(range.to) : addDays(now, BOOKING_CONFIG.maxHorizonDays + 31);
    if (toMillis(to) <= toMillis(from)) {
      throw new ValidationException([{ field: "to", message: "'to' must be after 'from'" }]);
    }

    const snapshot = await this.calendar.snapshot(listingId);
    const busy = mergeIntervals(
      snapshot.blocks
        .filter((b) => toMillis(b.endAt) > toMillis(from) && toMillis(b.startAt) < toMillis(to))
        .map((b) => ({ startAt: b.startAt, endAt: b.endAt })),
    );

    return {
      listingId,
      setUp: !!listing.bookableFrom && !!listing.bookableUntil,
      bookingMode: listing.bookingMode ?? "approval",
      bookableFrom: listing.bookableFrom ?? null,
      bookableUntil: listing.bookableUntil ?? null,
      minimumBillableDays: listing.minimumBillableDays ?? 1,
      maximumBillableDays: listing.maximumBillableDays || BOOKING_CONFIG.defaultMaximumBillableDays,
      maxHorizonDays: BOOKING_CONFIG.maxHorizonDays,
      acceptingRequests: !snapshot.onHold,
      from,
      to,
      busy,
    };
  }
}
