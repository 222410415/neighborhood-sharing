/**
 * Booking service — request creation and the decision commands.
 *
 * Creation and every command run inside the listing's calendar guard. The
 * quote is recalculated inside the transaction; a request carrying a stale
 * fingerprint gets 409 with the new quote. Payments and deposits are
 * simulated, labelled `mode: "simulated"`, and keyed deterministically so a
 * repeated command cannot record them twice.
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  computeExpiry,
  dueSystemTransition,
  normalizeIso,
  type BookingStatus,
  type CancelBookingBody,
  type CreateBookingBody,
  type PaymentComponent,
  type PaymentOperation,
  type TermsSnapshot,
} from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from "../../common/errors/api-exceptions.js";
import type { RequestOfferDoc, RequestPostDoc } from "../community/request.service.js";
import { formatRiyadh, formatSar } from "../../common/format.js";
import type { ListingDocument } from "../listings/listing.repository.js";
import {
  CalendarGuardService,
  applySystemTransition,
  type CalendarScope,
} from "../exchange/calendar-guard.service.js";
import { BookingEventWriter } from "../exchange/booking-event-writer.js";
import type { BookingDoc, DepositDoc, PaymentDoc } from "../exchange/exchange.types.js";
import { SYSTEM_ACTOR } from "../exchange/exchange.types.js";
import { ids } from "../exchange/ids.js";
import { MemberDirectory } from "../exchange/member-directory.service.js";
import { afterMessage, newConversationDoc, newMessageDoc } from "../exchange/conversation-docs.js";
import { buildQuote, quoteProblemToException } from "./quote.service.js";
import { BookingCommandRunner } from "./booking-command-runner.js";
import { currentPolicyVersionIds } from "../policies/policy.service.js";

export const POLICY_NOTE =
  "Draft demonstration terms pending team approval. The rental fee and the deposit are simulated: " +
  "no real money moves. Cancelling before collection refunds the simulated amounts in full. The deposit " +
  "is released after the owner confirms receipt; a reported issue keeps it under review (resolution is not available yet).";

/** Writes a simulated payment record; the id makes it impossible to record twice. */
export function recordSimulatedPayment(
  scope: CalendarScope,
  bookingId: string,
  component: PaymentComponent,
  operation: PaymentOperation,
  amountHalalas: number,
): void {
  if (amountHalalas <= 0) return;
  const id = ids.payment(bookingId, component, operation);
  const payment: PaymentDoc = {
    id,
    bookingId,
    component,
    operation,
    amountHalalas,
    currency: "SAR",
    status: "succeeded",
    mode: "simulated",
    idempotencyKey: id,
    createdAt: scope.now,
  };
  scope.buffer.set(scope.db.collection(COLLECTIONS.payments).doc(id), payment);
}

/** Refund whatever deposit is still held (simulated) and settle it. */
export function refundHeldDeposit(scope: CalendarScope, bookingId: string, deposit: DepositDoc | null): number {
  if (!deposit || deposit.heldHalalas <= 0) return 0;
  const amount = deposit.heldHalalas;
  recordSimulatedPayment(scope, bookingId, "deposit", "refund", amount);
  const updated: DepositDoc = {
    ...deposit,
    heldHalalas: 0,
    refundedHalalas: deposit.refundedHalalas + amount,
    status: "settled",
    revision: deposit.revision + 1,
    updatedAt: scope.now,
  };
  scope.buffer.set(scope.db.collection(COLLECTIONS.deposits).doc(bookingId), updated);
  return amount;
}

export function readDeposit(scope: CalendarScope, bookingId: string): Promise<DepositDoc | null> {
  return scope.read<DepositDoc>(scope.db.collection(COLLECTIONS.deposits).doc(bookingId));
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly calendar: CalendarGuardService,
    private readonly members: MemberDirectory,
    private readonly runner: BookingCommandRunner,
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  // ─── Create ───

  /** POST /me/bookings. A repeated clientRequestId returns the existing booking. */
  async create(borrowerUid: string, body: CreateBookingBody): Promise<BookingDoc> {
    const bookingId = ids.booking(borrowerUid, body.clientRequestId);
    const existingSnap = await this.db.collection(COLLECTIONS.bookings).doc(bookingId).get();
    if (existingSnap.exists) return existingSnap.data() as BookingDoc;

    const profile = await this.members.profile(borrowerUid);
    if (!profile || !profile.completedProfile) {
      throw new ForbiddenException("Complete your profile before requesting an item.");
    }

    const listingRef = this.db.collection(COLLECTIONS.listings).doc(body.listingId);
    const listingSnap = await listingRef.get();
    const listingBefore = listingSnap.exists ? (listingSnap.data() as ListingDocument) : null;
    if (!listingBefore || listingBefore.status !== "published") {
      throw new NotFoundException("This item is not available.");
    }
    if (listingBefore.ownerUid === borrowerUid) {
      throw new ForbiddenException("This is your item. You cannot request it.");
    }
    const names = await this.members.displayNames([borrowerUid, listingBefore.ownerUid]);
    const borrowerName = names.get(borrowerUid) ?? "A neighbor";
    // Policies in force when the request is made (read outside the transaction).
    const policyVersionIds = await currentPolicyVersionIds(this.db);
    const startAt = normalizeIso(body.startAt);
    const endAt = normalizeIso(body.endAt);

    return this.calendar.withListingCalendar(body.listingId, async (scope) => {
      const repeat = await scope.readBooking(bookingId);
      if (repeat) return repeat;

      const listing = await scope.read<ListingDocument>(listingRef);
      if (!listing || listing.status !== "published") {
        throw new ConflictException("This item is not available for booking right now.", {
          reason: "not_published",
        });
      }

      // A booking from a chosen community-request offer fulfils that request.
      let fromOffer: { offer: RequestOfferDoc; request: RequestPostDoc } | null = null;
      if (body.requestOfferId) {
        const offer = await scope.read<RequestOfferDoc>(
          this.db.collection(COLLECTIONS.requestOffers).doc(body.requestOfferId),
        );
        const request = offer
          ? await scope.read<RequestPostDoc>(this.db.collection(COLLECTIONS.requestPosts).doc(offer.requestPostId))
          : null;
        if (
          !offer ||
          !request ||
          offer.listingId !== listing.id ||
          offer.status !== "selected" ||
          offer.bookingId ||
          request.authorUid !== borrowerUid ||
          request.status !== "open"
        ) {
          throw new ValidationException([
            { field: "requestOfferId", message: "This offer can no longer be used for a booking." },
          ]);
        }
        fromOffer = { offer, request };
      }

      const quote = buildQuote(listing, startAt, endAt, scope, borrowerUid, scope.now);
      if (quote.quoteFingerprint !== body.quoteFingerprint) {
        throw new ConflictException("The item's terms changed since your quote. Review the new quote.", {
          reason: "quote_changed",
          quote,
        });
      }
      if (!quote.available) throw quoteProblemToException(quote);

      const terms: TermsSnapshot = {
        listingRevision: listing.revision,
        titleEn: listing.titleEn,
        ...(listing.titleAr ? { titleAr: listing.titleAr } : {}),
        condition: listing.condition,
        includedAccessories: listing.includedAccessories ?? [],
        primaryMediaId: listing.primaryMediaId ?? null,
        lendingMode: listing.lendingMode,
        currency: "SAR",
        billingUnit: "24_hours",
        dailyRateHalalas: quote.dailyRateHalalas,
        billableDays: quote.billableDays,
        rentalFeeHalalas: quote.rentalFeeHalalas,
        depositHalalas: quote.depositHalalas,
        totalHalalas: quote.totalHalalas,
        bookingMode: quote.bookingMode,
        paymentMode: "simulated",
        policyNote: POLICY_NOTE,
        policyVersionIds,
      };

      const conversation = newConversationDoc({
        contextType: "booking",
        contextId: bookingId,
        listingId: listing.id,
        uidA: borrowerUid,
        uidB: listing.ownerUid,
        createdByUid: borrowerUid,
        now: scope.now,
      });

      const booking: BookingDoc = {
        id: bookingId,
        listingId: listing.id,
        ownerUid: listing.ownerUid,
        borrowerUid,
        startAt,
        endAt,
        status: "pending",
        bookingModeSnapshot: quote.bookingMode,
        termsSnapshot: terms,
        expiresAt: computeExpiry("pending", scope.now, startAt),
        revision: 0,
        lastEventSequence: 0,
        createdAt: scope.now,
        updatedAt: scope.now,
        clientRequestId: body.clientRequestId,
        conversationId: conversation.id,
        requestOfferId: fromOffer ? fromOffer.offer.id : null,
      };
      if (fromOffer) {
        scope.buffer.set(this.db.collection(COLLECTIONS.requestOffers).doc(fromOffer.offer.id), {
          ...fromOffer.offer,
          bookingId,
          updatedAt: scope.now,
        });
        scope.buffer.set(this.db.collection(COLLECTIONS.requestPosts).doc(fromOffer.request.id), {
          ...fromOffer.request,
          status: "fulfilled",
          fulfilledBookingId: bookingId,
          revision: fromOffer.request.revision + 1,
          updatedAt: scope.now,
        });
      }

      const writer = new BookingEventWriter(booking, scope.now);
      const title = terms.titleEn;
      const dates = `${formatRiyadh(startAt)} to ${formatRiyadh(endAt)}`;
      const requested = writer.created(borrowerUid, "requested");

      if (quote.bookingMode === "instant") {
        if (quote.totalHalalas === 0) {
          writer.transition("accepted", SYSTEM_ACTOR, "accepted_instantly", "Instant booking: the owner accepts requests automatically.");
          const confirmed = writer.transition("confirmed", SYSTEM_ACTOR, "confirmed", "Nothing to pay: free item without a deposit.");
          writer.set({ acceptedAt: scope.now, confirmedAt: scope.now, expiresAt: null });
          scope.reserve(writer.booking, null, borrowerUid);
          writer.notify(confirmed, {
            recipientUid: listing.ownerUid,
            type: "booking_confirmed",
            title: "New confirmed booking",
            body: `${borrowerName} booked ${title} for ${dates}.`,
          });
        } else {
          const accepted = writer.transition("accepted", SYSTEM_ACTOR, "accepted_instantly", "Instant booking: dates held until the borrower confirms.");
          const hold = computeExpiry("accepted", scope.now, startAt);
          writer.set({ acceptedAt: scope.now, expiresAt: hold });
          scope.reserve(writer.booking, hold, borrowerUid);
          writer.notify(accepted, {
            recipientUid: listing.ownerUid,
            type: "booking_accepted",
            title: "Dates held by an instant booking",
            body: `${borrowerName} booked ${title} for ${dates}. Waiting for the simulated payment.`,
          });
        }
      } else {
        writer.notify(requested, {
          recipientUid: listing.ownerUid,
          type: "booking_requested",
          title: "New booking request",
          body: `${borrowerName} asked to borrow ${title} for ${dates}.`,
        });
      }

      // Booking conversation, with the request message as its first message.
      if (body.message) {
        const message = newMessageDoc({
          conversationId: conversation.id,
          senderUid: borrowerUid,
          body: body.message,
          clientMessageId: `${body.clientRequestId}-request`,
          now: scope.now,
        });
        Object.assign(conversation, afterMessage(message), {
          lastReadAt: { ...conversation.lastReadAt, [borrowerUid]: scope.now },
        });
        scope.buffer.set(this.db.collection(COLLECTIONS.messages).doc(message.id), message);
      }
      scope.buffer.set(this.db.collection(COLLECTIONS.conversations).doc(conversation.id), conversation);

      writer.writeTo(scope.buffer, this.db);
      return writer.booking;
    });
  }

  // ─── Decisions ───

  async accept(uid: string, bookingId: string, expectedRevision: number): Promise<BookingDoc> {
    const { booking } = await this.runner.run(bookingId, uid, {
      command: "accept",
      expectedRevision,
      prepare: (scope, b) =>
        scope.read<ListingDocument>(this.db.collection(COLLECTIONS.listings).doc(b.listingId)),
      apply: ({ scope, writer, booking, actorUid, actorName, now }, listing) => {
        if (!listing || listing.status !== "published") {
          throw new ConflictException(
            "This item is paused or archived, so it cannot take new bookings. Publish it again first.",
            { reason: "not_published" },
          );
        }
        if (scope.onHold) {
          throw new ConflictException(
            "A current exchange of this item is not closed yet, so new bookings are paused.",
            { reason: "item_on_hold" },
          );
        }
        if (scope.conflicts({ startAt: booking.startAt, endAt: booking.endAt }, booking.id).length > 0) {
          throw new ConflictException("These dates are no longer free. Another booking holds them.", {
            reason: "conflict",
          });
        }
        const title = booking.termsSnapshot.titleEn;
        const accepted = writer.transition("accepted", actorUid, "accepted");
        writer.set({ acceptedAt: now });
        if (booking.termsSnapshot.totalHalalas === 0) {
          const confirmed = writer.transition("confirmed", SYSTEM_ACTOR, "confirmed", "Nothing to pay: free item without a deposit.");
          writer.set({ confirmedAt: now, expiresAt: null });
          scope.reserve(booking, null, actorUid);
          writer.notify(confirmed, {
            recipientUid: booking.borrowerUid,
            type: "booking_confirmed",
            title: "Request accepted and confirmed",
            body: `${actorName} accepted your request for ${title}. Nothing to pay.`,
          });
        } else {
          const hold = computeExpiry("accepted", now, booking.startAt);
          writer.set({ expiresAt: hold });
          scope.reserve(booking, hold, actorUid);
          writer.notify(accepted, {
            recipientUid: booking.borrowerUid,
            type: "booking_accepted",
            title: "Request accepted",
            body: `${actorName} accepted your request for ${title}. Confirm with the simulated payment by ${formatRiyadh(hold)}.`,
          });
        }
      },
    });
    return booking;
  }

  async decline(uid: string, bookingId: string, expectedRevision: number): Promise<BookingDoc> {
    const { booking } = await this.runner.run(bookingId, uid, {
      command: "decline",
      expectedRevision,
      apply: ({ writer, booking, actorUid, actorName }) => {
        const seq = writer.transition("declined", actorUid, "declined");
        writer.set({ expiresAt: null });
        writer.notify(seq, {
          recipientUid: booking.borrowerUid,
          type: "booking_declined",
          title: "Request declined",
          body: `${actorName} declined your request for ${booking.termsSnapshot.titleEn}.`,
        });
      },
    });
    return booking;
  }

  /** Borrower confirms with a simulated payment of the rental fee and deposit. */
  async confirm(uid: string, bookingId: string, expectedRevision: number): Promise<BookingDoc> {
    const { booking } = await this.runner.run(bookingId, uid, {
      command: "confirm",
      expectedRevision,
      apply: ({ scope, writer, booking, actorUid, actorName, now }) => {
        const terms = booking.termsSnapshot;
        const paid: string[] = [];
        if (terms.rentalFeeHalalas > 0) paid.push(`rental fee ${formatSar(terms.rentalFeeHalalas)}`);
        if (terms.depositHalalas > 0) paid.push(`deposit ${formatSar(terms.depositHalalas)}`);
        const seq = writer.transition(
          "confirmed",
          actorUid,
          "confirmed",
          paid.length > 0 ? `Simulated payment: ${paid.join(" and ")}.` : "Nothing to pay.",
        );
        writer.set({ confirmedAt: now, expiresAt: null });
        scope.keepReservation(booking.id);

        recordSimulatedPayment(scope, booking.id, "rental", "collect", terms.rentalFeeHalalas);
        if (terms.depositHalalas > 0) {
          recordSimulatedPayment(scope, booking.id, "deposit", "collect", terms.depositHalalas);
          const deposit: DepositDoc = {
            bookingId: booking.id,
            requiredHalalas: terms.depositHalalas,
            capturedHalalas: terms.depositHalalas,
            heldHalalas: terms.depositHalalas,
            refundedHalalas: 0,
            compensationHalalas: 0,
            status: "held",
            mode: "simulated",
            revision: 1,
            createdAt: now,
            updatedAt: now,
          };
          scope.buffer.set(scope.db.collection(COLLECTIONS.deposits).doc(booking.id), deposit);
        }
        writer.notify(seq, {
          recipientUid: booking.ownerUid,
          type: "booking_confirmed",
          title: "Booking confirmed",
          body: `${actorName} confirmed ${terms.titleEn} (simulated payment). Agree the pickup arrangement next.`,
        });
      },
    });
    return booking;
  }

  /** Either participant, before collection. Simulated amounts are refunded in full. */
  async cancel(uid: string, bookingId: string, body: CancelBookingBody): Promise<BookingDoc> {
    const { booking } = await this.runner.run(bookingId, uid, {
      command: "cancel",
      expectedRevision: body.expectedRevision,
      prepare: (scope, b) => readDeposit(scope, b.id),
      apply: ({ scope, writer, booking, actorUid, actorName, otherUid, now }, deposit) => {
        const before: BookingStatus = booking.status;
        const seq = writer.transition("cancelled", actorUid, "cancelled", body.reason || undefined);
        writer.set({ cancelledAt: now, cancelledByUid: actorUid, expiresAt: null });
        if (before === "accepted" || before === "confirmed") {
          scope.releaseReservation(booking.id);
        }
        let refunded = false;
        if (before === "confirmed") {
          recordSimulatedPayment(scope, booking.id, "rental", "refund", booking.termsSnapshot.rentalFeeHalalas);
          refundHeldDeposit(scope, booking.id, deposit);
          refunded = booking.termsSnapshot.totalHalalas > 0;
        }
        writer.notify(seq, {
          recipientUid: otherUid,
          type: "booking_cancelled",
          title: "Booking cancelled",
          body: `${actorName} cancelled the booking for ${booking.termsSnapshot.titleEn}.${
            refunded ? " Simulated payments were refunded." : ""
          }`,
        });
      },
    });
    return booking;
  }

  // ─── Lazy system transitions ───

  /**
   * Apply expiry or overdue if server time has made it due. Called on reads;
   * commands do the same inside their own transaction.
   */
  async refreshIfDue(booking: BookingDoc): Promise<BookingDoc> {
    if (!dueSystemTransition(booking, new Date().toISOString())) return booking;
    try {
      return await this.calendar.withListingCalendar(booking.listingId, async (scope) => {
        const fresh = await scope.readBooking(booking.id);
        if (!fresh) return booking;
        const planned = scope.claim(fresh.id);
        const due = planned ?? dueSystemTransition(fresh, scope.now);
        if (!due) return fresh;
        const writer = new BookingEventWriter(fresh, scope.now);
        applySystemTransition(scope, writer, due);
        writer.writeTo(scope.buffer, scope.db);
        return writer.booking;
      });
    } catch (err) {
      this.logger.warn(`Could not apply due transition for ${booking.id}: ${(err as Error).message}`);
      return booking;
    }
  }

  /** POST /internal/sweep — bulk version of the lazy evaluation. */
  async sweep(limitPerStatus = 200): Promise<{ checked: number; changed: number }> {
    let checked = 0;
    let changed = 0;
    for (const status of ["pending", "accepted", "active"] as const) {
      const snap = await this.db
        .collection(COLLECTIONS.bookings)
        .where("status", "==", status)
        .limit(limitPerStatus)
        .get();
      for (const doc of snap.docs) {
        const booking = doc.data() as BookingDoc;
        checked++;
        const after = await this.refreshIfDue(booking);
        if (after.status !== booking.status) changed++;
      }
    }
    return { checked, changed };
  }
}
