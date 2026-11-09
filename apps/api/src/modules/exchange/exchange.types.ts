/**
 * Firestore document shapes for the Sprint 2 exchange workflow.
 * Times are UTC ISO strings with milliseconds and Z; money is integer halalas.
 */

import type {
  ArrangementDto,
  BookingDto,
  BookingEventDto,
  ConditionReportDto,
  ConversationContextType,
  DepositDto,
  DisputeDto,
  MessageDto,
  NotificationDto,
  PaymentDto,
  ReportDto,
} from "@neighborhood/contracts";

/** One per listing: the shared concurrency guard for its calendar. */
export interface CalendarControlDoc {
  listingId: string;
  revision: number;
  /** Set while a booking is overdue, return pending or disputed. */
  blockingBookingId: string | null;
  /** Sprint 3: item lost or needing repair after a dispute; cleared when the owner republishes. */
  itemHold?: ItemHold | null;
  /** Sprint 3: increases whenever dates are released (deduplicates availability alerts). */
  availabilityRevision?: number;
  updatedAt: string;
}

export interface ItemHold {
  reason: "lost" | "needs_repair";
  bookingId: string;
  since: string;
}

export interface AvailabilityBlockDoc {
  id: string;
  listingId: string;
  kind: "owner" | "reservation";
  startAt: string;
  endAt: string;
  status: "live" | "released";
  /** Reservation only; block id is res_{bookingId}. */
  bookingId: string | null;
  /** Reservation only, while the booking is accepted and not yet confirmed. */
  holdExpiresAt: string | null;
  /** Owner only; never returned by public routes. */
  note?: string;
  createdByUid: string;
  createdAt: string;
  releasedAt: string | null;
  clientRequestId?: string | null;
}

export interface BookingDoc extends BookingDto {
  clientRequestId: string;
  conversationId: string | null;
  /** Sprint 3: which participants have reviewed. */
  reviewState?: { ownerReviewed?: boolean; borrowerReviewed?: boolean };
  /** Sprint 3: the dispute case for this booking, if any. */
  disputeId?: string | null;
  /** Sprint 3: community-request offer this booking came from. */
  requestOfferId?: string | null;
}

export type BookingEventDoc = BookingEventDto;
export type NotificationDoc = NotificationDto;
export type PaymentDoc = PaymentDto;
export type DepositDoc = DepositDto;

export interface ConditionReportDoc extends ConditionReportDto {
  clientRequestId: string;
}

/** Versions written before Sprint 3 have no version fields. */
export function conditionVersion(doc: Pick<ConditionReportDoc, "version">): number {
  return doc.version ?? 1;
}

export interface BookingPrivateDetailsDoc {
  bookingId: string;
  participantUids: string[];
  pickup: ArrangementDto | null;
  return: ArrangementDto | null;
  updatedAt: string;
}

export interface ConversationDoc {
  id: string;
  contextType: ConversationContextType;
  contextId: string;
  /** Listing behind the context (the listing itself, or the booked listing). */
  listingId: string;
  /** Exactly two member UIDs, sorted. */
  participantUids: string[];
  /** Who opened it; an enquiry without messages is shown only to them. */
  createdByUid: string;
  lastMessageAt: string | null;
  lastMessageId?: string | null;
  lastMessagePreview: string | null;
  lastMessageSenderUid: string | null;
  lastReadAt: Record<string, string | null>;
  createdAt: string;
  updatedAt: string;
}

/** A message a reviewer removed keeps its record; participants see a placeholder. */
export type MessageDoc = MessageDto & { moderationStatus?: "removed"; moderatedAt?: string };

export const SYSTEM_ACTOR = "system";

/** Sprint 3: one case per booking, id dsp_{bookingId}. */
export type DisputeDoc = DisputeDto;

export function disputeIdFor(bookingId: string): string {
  return `dsp_${bookingId}`;
}

export interface ReportDoc extends ReportDto {
  clientRequestId: string;
}
