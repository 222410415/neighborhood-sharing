import { z } from "zod";
import { idSchema, timestampSchema } from "../common/limits";
import { BOOKING_CONFIG } from "./booking-config";
import {
  BOOKING_STATUSES,
  type BookingCommand,
  type BookingStatus,
  type ParticipantRole,
} from "./booking-rules";
import type { PaymentDto, DepositDto } from "../payment/payment-contracts";
import type { ConditionReportDto } from "../condition/condition-contracts";

/**
 * Booking contracts.
 *
 * Request bodies are validated on the server with these schemas. Response
 * shapes are plain types. Times are UTC ISO strings; money is integer halalas.
 */

export const bookingStatusSchema = z.enum(BOOKING_STATUSES);
export const bookingModeSchema = z.enum(["approval", "instant"]);

/** Client-generated id that makes a creating command safe to repeat. */
export const clientRequestIdSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, "Use letters, digits, '-' or '_'");

export const expectedRevisionSchema = z.number().int().nonnegative();

export const createBookingBodySchema = z.object({
  listingId: idSchema,
  startAt: timestampSchema,
  endAt: timestampSchema,
  quoteFingerprint: z.string().min(1).max(128),
  message: z.string().trim().max(BOOKING_CONFIG.maxMessageLength).optional(),
  clientRequestId: clientRequestIdSchema,
  /** Set when the request comes from a chosen community-request offer. */
  requestOfferId: idSchema.optional(),
});

export const bookingCommandBodySchema = z.object({
  expectedRevision: expectedRevisionSchema,
});

export const cancelBookingBodySchema = z.object({
  expectedRevision: expectedRevisionSchema,
  reason: z.string().trim().max(500).optional(),
});

export const reportIssueBodySchema = z.object({
  expectedRevision: expectedRevisionSchema,
  reason: z.string().trim().min(1, "Describe the issue").max(BOOKING_CONFIG.maxNoteLength),
});

export const listBookingsQuerySchema = z.object({
  role: z.enum(["borrower", "owner"]).default("borrower"),
  status: bookingStatusSchema.optional(),
});

// ─── Arrangements (private to the two participants) ───

export const arrangementKindSchema = z.enum(["pickup", "return"]);
export const arrangementMethodSchema = z.enum(["pickup", "meetup"]);

export const arrangementBodySchema = z.object({
  method: arrangementMethodSchema,
  agreedAt: timestampSchema,
  locationText: z.string().trim().min(1, "Enter a place").max(300),
  instructions: z.string().trim().max(500).optional(),
  /** Revision of the arrangement being replaced; 0 when none exists yet. */
  expectedArrangementRevision: z.number().int().nonnegative(),
});

export const acknowledgeArrangementBodySchema = z.object({
  arrangementRevision: z.number().int().positive(),
});

export type BookingMode = z.infer<typeof bookingModeSchema>;
export type CreateBookingBody = z.infer<typeof createBookingBodySchema>;
export type BookingCommandBody = z.infer<typeof bookingCommandBodySchema>;
export type CancelBookingBody = z.infer<typeof cancelBookingBodySchema>;
export type ReportIssueBody = z.infer<typeof reportIssueBodySchema>;
export type ArrangementKind = z.infer<typeof arrangementKindSchema>;
export type ArrangementMethod = z.infer<typeof arrangementMethodSchema>;
export type ArrangementBody = z.infer<typeof arrangementBodySchema>;
export type AcknowledgeArrangementBody = z.infer<typeof acknowledgeArrangementBodySchema>;

// ─── Response shapes ───

/** Agreement captured when the request is sent; later listing edits do not change it. */
export interface TermsSnapshot {
  listingRevision: number;
  titleEn: string;
  titleAr?: string;
  condition: string;
  includedAccessories: string[];
  primaryMediaId: string | null;
  lendingMode: "free" | "paid";
  currency: "SAR";
  billingUnit: "24_hours";
  dailyRateHalalas: number;
  billableDays: number;
  rentalFeeHalalas: number;
  depositHalalas: number;
  totalHalalas: number;
  bookingMode: BookingMode;
  paymentMode: "simulated";
  policyNote: string;
  /** Policy versions in force when the request was made (Sprint 3; absent on older bookings). */
  policyVersionIds?: string[];
}

export interface BookingDto {
  id: string;
  listingId: string;
  ownerUid: string;
  borrowerUid: string;
  startAt: string;
  endAt: string;
  status: BookingStatus;
  bookingModeSnapshot: BookingMode;
  termsSnapshot: TermsSnapshot;
  expiresAt: string | null;
  revision: number;
  lastEventSequence: number;
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string | null;
  confirmedAt?: string | null;
  collectedAt?: string | null;
  returnReportedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  cancelledByUid?: string | null;
  expiredAt?: string | null;
  overdueAt?: string | null;
  disputedAt?: string | null;
}

export interface BookingEventDto {
  id: string;
  bookingId: string;
  sequence: number;
  eventType: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  actorUid: string;
  actorRole: ParticipantRole | "system";
  occurredAt: string;
  note?: string;
}

export interface ArrangementDto {
  kind: ArrangementKind;
  method: ArrangementMethod;
  agreedAt: string;
  locationText: string;
  instructions?: string;
  revision: number;
  proposedByUid: string;
  proposedAt: string;
  acknowledgedByUid: string | null;
  acknowledgedAt: string | null;
}

export interface MemberSummaryDto {
  uid: string;
  displayName: string;
}

export interface BookingSummaryDto {
  booking: BookingDto;
  role: ParticipantRole;
  otherMember: MemberSummaryDto;
  availableCommands: BookingCommand[];
}

export interface BookingDetailDto extends BookingSummaryDto {
  listing: { id: string; status: string; isPublic: boolean };
  events: BookingEventDto[];
  payments: PaymentDto[];
  deposit: DepositDto | null;
  arrangements: { pickup: ArrangementDto | null; return: ArrangementDto | null };
  conditionReports: { collection: ConditionReportDto | null; return: ConditionReportDto | null };
  conversationId: string | null;
  /** True while an overdue, return-pending or disputed booking holds the item. */
  itemOnHold: boolean;
  /** Sprint 3 */
  disputeId: string | null;
  conditionHistory: ConditionReportDto[];
  review: {
    canReview: boolean;
    reviewWindowEndsAt: string | null;
    mine: { rating: number; comment: string; createdAt: string } | null;
    theirsSubmitted: boolean;
  };
  canOpenDispute: boolean;
  canCorrectCondition: { collection: boolean; return: boolean };
}
