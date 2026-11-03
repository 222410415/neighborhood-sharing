/**
 * Response shapes of the Sprint 2 exchange API, as used by the interface.
 * They mirror packages/contracts (the server validates every request body).
 */

export type BookingStatus =
  | "pending"
  | "accepted"
  | "confirmed"
  | "active"
  | "overdue"
  | "return_pending"
  | "disputed"
  | "completed"
  | "declined"
  | "cancelled"
  | "expired";

export type BookingMode = "approval" | "instant";
export type ParticipantRole = "owner" | "borrower";

export type BookingCommand =
  | "accept"
  | "decline"
  | "confirm"
  | "cancel"
  | "submit_collection_condition"
  | "acknowledge_collection"
  | "submit_return_condition"
  | "report_return"
  | "confirm_receipt"
  | "report_issue"
  | "arrange_pickup"
  | "arrange_return"
  | "correct_collection_condition"
  | "correct_return_condition";

export interface Interval {
  startAt: string;
  endAt: string;
}

export interface AvailabilityInfo {
  listingId: string;
  setUp: boolean;
  bookingMode: BookingMode;
  bookableFrom: string | null;
  bookableUntil: string | null;
  minimumBillableDays: number;
  maximumBillableDays: number;
  maxHorizonDays: number;
  acceptingRequests: boolean;
  from: string;
  to: string;
  busy: Interval[];
}

export interface OwnerBlock {
  id: string;
  kind: "owner" | "reservation";
  startAt: string;
  endAt: string;
  status: "live" | "released";
  note?: string;
  bookingId?: string;
  holdExpiresAt?: string | null;
  createdAt: string;
}

export interface OwnerCalendar {
  listingId: string;
  bookingMode: BookingMode;
  bookableFrom: string | null;
  bookableUntil: string | null;
  revision: number;
  itemOnHold: boolean;
  ownerBlocks: OwnerBlock[];
  reservations: OwnerBlock[];
}

export type QuoteProblem =
  | "not_set_up"
  | "invalid_range"
  | "in_past"
  | "beyond_horizon"
  | "outside_window"
  | "too_long"
  | "conflict"
  | "item_on_hold"
  | "own_item"
  | "not_published";

export interface Quote {
  listingId: string;
  startAt: string;
  endAt: string;
  currency: "SAR";
  lendingMode: "free" | "paid";
  bookingMode: BookingMode;
  dailyRateHalalas: number;
  billableDays: number;
  rentalFeeHalalas: number;
  depositHalalas: number;
  totalHalalas: number;
  available: boolean;
  problem: QuoteProblem | null;
  message: string | null;
  confirmation: "owner_approval" | "instant" | "instant_no_payment";
  paymentMode: "simulated";
  quoteFingerprint: string;
}

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
}

export interface Booking {
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
  createdAt: string;
  updatedAt: string;
  acceptedAt?: string | null;
  confirmedAt?: string | null;
  collectedAt?: string | null;
  returnReportedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
}

export interface BookingEvent {
  id: string;
  sequence: number;
  eventType: string;
  fromStatus: BookingStatus | null;
  toStatus: BookingStatus;
  actorUid: string;
  actorRole: ParticipantRole | "system";
  occurredAt: string;
  note?: string;
}

export interface Payment {
  id: string;
  component: "rental" | "deposit";
  operation: "collect" | "refund" | "compensation";
  amountHalalas: number;
  currency: "SAR";
  status: "succeeded";
  mode: "simulated";
  createdAt: string;
}

export interface Deposit {
  requiredHalalas: number;
  capturedHalalas: number;
  heldHalalas: number;
  refundedHalalas: number;
  compensationHalalas: number;
  status: "pending" | "held" | "under_review" | "settled";
  mode: "simulated";
}

export interface Arrangement {
  kind: "pickup" | "return";
  method: "pickup" | "meetup";
  agreedAt: string;
  locationText: string;
  instructions?: string;
  revision: number;
  proposedByUid: string;
  proposedAt: string;
  acknowledgedByUid: string | null;
  acknowledgedAt: string | null;
}

export type OverallCondition = "new" | "excellent" | "good" | "fair" | "damaged";

export interface ChecklistItem {
  label: string;
  ok: boolean;
  note?: string;
}

export interface ConditionReport {
  id: string;
  stage: "collection" | "return";
  version: number;
  supersedesId: string | null;
  submittedByUid: string;
  overallCondition: OverallCondition;
  checklist: ChecklistItem[];
  notes: string;
  mediaIds: string[];
  status: "submitted";
  submittedAt: string;
  acknowledgement: {
    decision: "agreed" | "disagreed";
    byUid: string;
    note?: string;
    at: string;
  } | null;
}

export interface MemberSummary {
  uid: string;
  displayName: string;
}

export interface BookingSummary {
  booking: Booking;
  role: ParticipantRole;
  otherMember: MemberSummary;
  availableCommands: BookingCommand[];
}

export interface BookingDetail extends BookingSummary {
  listing: { id: string; status: string; isPublic: boolean };
  events: BookingEvent[];
  payments: Payment[];
  deposit: Deposit | null;
  arrangements: { pickup: Arrangement | null; return: Arrangement | null };
  conditionReports: { collection: ConditionReport | null; return: ConditionReport | null };
  conversationId: string | null;
  itemOnHold: boolean;
  disputeId: string | null;
  conditionHistory: ConditionReport[];
  review: {
    canReview: boolean;
    reviewWindowEndsAt: string | null;
    mine: { rating: number; comment: string; createdAt: string } | null;
    theirsSubmitted: boolean;
  };
  canOpenDispute: boolean;
  canCorrectCondition: { collection: boolean; return: boolean };
}
