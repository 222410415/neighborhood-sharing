/**
 * Booking queries — the Borrowing and Lending lists and the booking detail.
 *
 * Only the two participants can read a booking (404 for anyone else). Reads
 * apply due expiry/overdue transitions first. Queries use a single equality
 * filter and sort bounded results in memory, so no composite index is needed.
 */

import { Injectable } from "@nestjs/common";
import type { DocumentSnapshot } from "firebase-admin/firestore";
import {
  TRUST_CONFIG,
  addDays,
  availableCommands,
  toMillis,
  type BookingDetailDto,
  type BookingDto,
  type BookingEventDto,
  type BookingStatus,
  type BookingSummaryDto,
  type ConditionReportDto,
  type ExchangeProgress,
  type ParticipantRole,
} from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import type { ListingDocument } from "../listings/listing.repository.js";
import type {
  BookingDoc,
  BookingEventDoc,
  BookingPrivateDetailsDoc,
  CalendarControlDoc,
  ConditionReportDoc,
  DepositDoc,
  PaymentDoc,
} from "../exchange/exchange.types.js";
import { ids } from "../exchange/ids.js";
import { MemberDirectory } from "../exchange/member-directory.service.js";
import { BookingCommandRunner } from "./booking-command-runner.js";
import { BookingService } from "./booking.service.js";
import { latestByStage, withVersion } from "./condition-versions.js";

const LIST_LIMIT = 200;

interface ReviewLike {
  rating: number;
  comment: string;
  createdAt: string;
}

function toBookingDto(doc: BookingDoc): BookingDto {
  // Strip internal fields; everything else is participant-visible.
  const { clientRequestId: _c, conversationId: _v, ...dto } = doc;
  return dto;
}

function toReportDto(doc: ConditionReportDoc | null): ConditionReportDto | null {
  if (!doc) return null;
  const { clientRequestId: _c, ...dto } = withVersion(doc);
  return dto;
}

function progressOf(
  collection: ConditionReportDoc | null,
  returnReport: ConditionReportDoc | null,
): ExchangeProgress {
  return {
    hasCollectionReport: !!collection,
    collectionAcknowledgement: collection?.acknowledgement?.decision ?? null,
    hasReturnReport: !!returnReport,
  };
}

/** States where condition records can exist; others need no extra reads. */
const HANDOVER_STATES: readonly BookingStatus[] = [
  "confirmed",
  "active",
  "overdue",
  "return_pending",
  "disputed",
  "completed",
];

@Injectable()
export class BookingQueryService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly members: MemberDirectory,
    private readonly runner: BookingCommandRunner,
    private readonly bookings: BookingService,
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  private async readReports(bookingIds: string[]): Promise<Map<string, ConditionReportDoc>> {
    const map = new Map<string, ConditionReportDoc>();
    if (bookingIds.length === 0) return map;
    const refs = bookingIds.flatMap((id) => [
      this.db.collection(COLLECTIONS.conditionReports).doc(ids.conditionReport(id, "collection")),
      this.db.collection(COLLECTIONS.conditionReports).doc(ids.conditionReport(id, "return")),
    ]);
    const snaps = await this.db.getAll(...refs);
    for (const snap of snaps) {
      if (snap.exists) map.set(snap.id, snap.data() as ConditionReportDoc);
    }
    return map;
  }

  private reviewState(booking: BookingDoc, mine: ReviewLike | null, theirsSubmitted: boolean) {
    const windowEnd =
      booking.status === "completed" && booking.completedAt
        ? addDays(booking.completedAt, TRUST_CONFIG.reviewWindowDays)
        : null;
    const open = !!windowEnd && toMillis(windowEnd) >= Date.now();
    return {
      canReview: open && !mine,
      reviewWindowEndsAt: windowEnd,
      mine: mine ? { rating: mine.rating, comment: mine.comment, createdAt: mine.createdAt } : null,
      theirsSubmitted,
    };
  }

  /** A case can be opened during use, or as a complaint within the review window after completion. */
  private canOpenDispute(booking: BookingDoc): boolean {
    if (booking.disputeId) return false;
    if (["active", "overdue", "return_pending"].includes(booking.status)) return true;
    if (booking.status === "completed" && booking.completedAt) {
      return toMillis(addDays(booking.completedAt, TRUST_CONFIG.reviewWindowDays)) >= Date.now();
    }
    return false;
  }

  /** GET /me/bookings?role=borrower|owner&status= */
  async list(uid: string, role: ParticipantRole, status?: BookingStatus): Promise<BookingSummaryDto[]> {
    const field = role === "owner" ? "ownerUid" : "borrowerUid";
    const snap = await this.db.collection(COLLECTIONS.bookings).where(field, "==", uid).limit(LIST_LIMIT).get();
    const fresh: BookingDoc[] = [];
    for (const doc of snap.docs) {
      fresh.push(await this.bookings.refreshIfDue(doc.data() as BookingDoc));
    }
    const filtered = status ? fresh.filter((b) => b.status === status) : fresh;
    filtered.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));

    const names = await this.members.displayNames(
      filtered.map((b) => (role === "owner" ? b.borrowerUid : b.ownerUid)),
    );
    const reports = await this.readReports(
      filtered.filter((b) => HANDOVER_STATES.includes(b.status)).map((b) => b.id),
    );

    return filtered.map((b) => {
      const otherUid = role === "owner" ? b.borrowerUid : b.ownerUid;
      const progress = progressOf(
        reports.get(ids.conditionReport(b.id, "collection")) ?? null,
        reports.get(ids.conditionReport(b.id, "return")) ?? null,
      );
      return {
        booking: toBookingDto(b),
        role,
        otherMember: { uid: otherUid, displayName: names.get(otherUid) ?? "Member" },
        availableCommands: availableCommands(role, b.status, progress),
      };
    });
  }

  /** GET /me/bookings/:id — participants only. */
  async detail(uid: string, bookingId: string): Promise<BookingDetailDto> {
    const loaded = await this.runner.getForParticipant(bookingId, uid);
    const booking = await this.bookings.refreshIfDue(loaded);
    const role: ParticipantRole = uid === booking.ownerUid ? "owner" : "borrower";
    const otherUid = role === "owner" ? booking.borrowerUid : booking.ownerUid;

    const [eventsSnap, paymentsSnap, reportsSnap, refs, names] = await Promise.all([
      this.db.collection(COLLECTIONS.bookingEvents).where("bookingId", "==", bookingId).get(),
      this.db.collection(COLLECTIONS.payments).where("bookingId", "==", bookingId).get(),
      this.db.collection(COLLECTIONS.conditionReports).where("bookingId", "==", bookingId).get(),
      this.db.getAll(
        this.db.collection(COLLECTIONS.deposits).doc(bookingId),
        this.db.collection(COLLECTIONS.bookingPrivateDetails).doc(bookingId),
        this.db.collection(COLLECTIONS.listings).doc(booking.listingId),
        this.db.collection(COLLECTIONS.calendarControls).doc(booking.listingId),
        this.db.collection(COLLECTIONS.reviews).doc(`${bookingId}_${uid}`),
        this.db.collection(COLLECTIONS.reviews).doc(`${bookingId}_${otherUid}`),
      ),
      this.members.displayNames([otherUid]),
    ]);
    const [depositSnap, detailsSnap, listingSnap, guardSnap, myReviewSnap, theirReviewSnap] = refs;
    const versions = latestByStage(reportsSnap.docs.map((d) => d.data() as ConditionReportDoc));
    const data = <T>(snap: DocumentSnapshot | undefined): T | null =>
      snap?.exists ? (snap.data() as T) : null;

    const events = eventsSnap.docs
      .map((d) => d.data() as BookingEventDoc)
      .sort((a, b) => a.sequence - b.sequence) as BookingEventDto[];
    const payments = paymentsSnap.docs
      .map((d) => d.data() as PaymentDoc)
      .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
    const collection = versions.collection;
    const returnReport = versions.return;
    const details = data<BookingPrivateDetailsDoc>(detailsSnap);
    const listing = data<ListingDocument>(listingSnap);
    const guard = data<CalendarControlDoc>(guardSnap);

    const commands = availableCommands(role, booking.status, progressOf(collection, returnReport));
    return {
      booking: toBookingDto(booking),
      role,
      otherMember: { uid: otherUid, displayName: names.get(otherUid) ?? "Member" },
      availableCommands: commands,
      listing: {
        id: booking.listingId,
        status: listing?.status ?? "archived",
        isPublic: listing?.status === "published",
      },
      events,
      payments,
      deposit: data<DepositDoc>(depositSnap),
      arrangements: { pickup: details?.pickup ?? null, return: details?.return ?? null },
      conditionReports: { collection: toReportDto(collection), return: toReportDto(returnReport) },
      conversationId: booking.conversationId ?? null,
      itemOnHold: !!guard?.blockingBookingId,
      disputeId: booking.disputeId ?? null,
      conditionHistory: versions.superseded.map((r) => toReportDto(r)!),
      review: this.reviewState(booking, data<ReviewLike>(myReviewSnap), !!theirReviewSnap?.exists),
      canOpenDispute: this.canOpenDispute(booking),
      canCorrectCondition: {
        collection: commands.includes("correct_collection_condition"),
        return: commands.includes("correct_return_condition"),
      },
    };
  }
}
