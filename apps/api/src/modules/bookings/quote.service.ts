/**
 * Quote service — recalculates the quote on the server from the current
 * listing. The same `buildQuote` runs inside the booking transaction, so the
 * request is checked against exactly the terms and calendar it will reserve.
 */

import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import {
  BOOKING_CONFIG,
  checkBookingDates,
  computeQuoteAmounts,
  findOverlaps,
  normalizeIso,
  type QuoteBody,
  type QuoteDto,
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
import { CalendarGuardService } from "../exchange/calendar-guard.service.js";
import type { AvailabilityBlockDoc } from "../exchange/exchange.types.js";

export interface CalendarState {
  blocks: AvailabilityBlockDoc[];
  onHold: boolean;
}

/** Changes whenever the listing (any revision), its terms or the dates change. */
export function quoteFingerprint(listing: ListingDocument, startAt: string, endAt: string): string {
  const parts = [
    "v1",
    listing.id,
    String(listing.revision),
    String(listing.dailyRateHalalas),
    String(listing.depositHalalas),
    String(listing.minimumBillableDays),
    String(listing.maximumBillableDays),
    listing.lendingMode,
    listing.bookingMode ?? "approval",
    startAt,
    endAt,
  ];
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 32);
}

export function buildQuote(
  listing: ListingDocument,
  startAtInput: string,
  endAtInput: string,
  calendar: CalendarState,
  viewerUid: string | undefined,
  nowIso: string,
): QuoteDto {
  const startAt = normalizeIso(startAtInput);
  const endAt = normalizeIso(endAtInput);
  const bookingMode = listing.bookingMode ?? "approval";
  const amounts = computeQuoteAmounts(
    {
      dailyRateHalalas: listing.lendingMode === "free" ? 0 : listing.dailyRateHalalas,
      depositHalalas: listing.depositHalalas ?? 0,
      minimumBillableDays: listing.minimumBillableDays ?? 1,
    },
    startAt,
    endAt,
  );

  const base: QuoteDto = {
    listingId: listing.id,
    startAt,
    endAt,
    currency: "SAR",
    lendingMode: listing.lendingMode,
    bookingMode,
    dailyRateHalalas: listing.lendingMode === "free" ? 0 : listing.dailyRateHalalas,
    ...amounts,
    available: true,
    problem: null,
    message: null,
    confirmation:
      bookingMode === "approval"
        ? "owner_approval"
        : amounts.totalHalalas === 0
          ? "instant_no_payment"
          : "instant",
    paymentMode: "simulated",
    quoteFingerprint: quoteFingerprint(listing, startAt, endAt),
  };

  const unavailable = (problem: QuoteDto["problem"], message: string): QuoteDto => ({
    ...base,
    available: false,
    problem,
    message,
  });

  if (listing.status !== "published") {
    return unavailable("not_published", "This item is not available for booking right now.");
  }
  if (viewerUid && viewerUid === listing.ownerUid) {
    return unavailable("own_item", "This is your item. You cannot request it.");
  }
  const dates = checkBookingDates({
    startAt,
    endAt,
    nowIso,
    bookableFrom: listing.bookableFrom,
    bookableUntil: listing.bookableUntil,
    minimumBillableDays: listing.minimumBillableDays ?? 1,
    maximumBillableDays: listing.maximumBillableDays || BOOKING_CONFIG.defaultMaximumBillableDays,
  });
  if (!dates.ok) {
    return unavailable(dates.problem, dates.message);
  }
  if (calendar.onHold) {
    return unavailable(
      "item_on_hold",
      "This item is not taking new bookings until a current exchange is closed.",
    );
  }
  if (findOverlaps(calendar.blocks, { startAt, endAt }).length > 0) {
    return unavailable("conflict", "Some of these dates are not available. Choose other dates.");
  }
  return base;
}

/** Turn an unavailable quote into the HTTP error a booking request receives. */
export function quoteProblemToException(quote: QuoteDto): Error {
  const message = quote.message ?? "These dates cannot be booked.";
  switch (quote.problem) {
    case "own_item":
      return new ForbiddenException(message);
    case "conflict":
    case "item_on_hold":
    case "not_published":
      return new ConflictException(message, { reason: quote.problem, quote });
    case "invalid_range":
    case "too_long":
      return new ValidationException([{ field: "endAt", message }]);
    default:
      return new ValidationException([{ field: "startAt", message }]);
  }
}

@Injectable()
export class QuoteService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly calendar: CalendarGuardService,
  ) {}

  /** POST /listings/:id/quote — published listings only. */
  async quoteForListing(listingId: string, body: QuoteBody, viewerUid?: string): Promise<QuoteDto> {
    const snap = await this.firebase.firestore.collection(COLLECTIONS.listings).doc(listingId).get();
    const listing = snap.exists ? (snap.data() as ListingDocument) : null;
    if (!listing || listing.status !== "published") {
      throw new NotFoundException("Listing not found");
    }
    const calendar = await this.calendar.snapshot(listingId);
    return buildQuote(listing, body.startAt, body.endAt, calendar, viewerUid, new Date().toISOString());
  }
}
