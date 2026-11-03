/**
 * Pure booking rules shared by the API and unit tests.
 *
 * No I/O and no Zod here, so these functions load in any runtime (including
 * the CommonJS Jest setup). Times are ISO 8601 strings; intervals are
 * half-open [startAt, endAt). Money is integer halalas.
 */

import { BOOKING_CONFIG, DAY_MS, HOUR_MS } from "./booking-config";

// ─── States ───

export const BOOKING_STATUSES = [
  "pending",
  "accepted",
  "confirmed",
  "active",
  "overdue",
  "return_pending",
  "disputed",
  "completed",
  "declined",
  "cancelled",
  "expired",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type ParticipantRole = "owner" | "borrower";

/** Permitted next states (design Section 6.2). */
export const ALLOWED_TRANSITIONS: Record<BookingStatus, readonly BookingStatus[]> = {
  pending: ["accepted", "declined", "cancelled", "expired"],
  accepted: ["confirmed", "cancelled", "expired"],
  confirmed: ["active", "cancelled"],
  active: ["return_pending", "overdue", "disputed"],
  overdue: ["return_pending", "disputed"],
  return_pending: ["completed", "disputed"],
  // Resolution of a dispute is Sprint 3 (administration workspace).
  disputed: ["completed"],
  completed: [],
  declined: [],
  cancelled: [],
  expired: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** States whose reservation block stays live on the calendar. */
export const RESERVING_STATUSES: readonly BookingStatus[] = [
  "accepted",
  "confirmed",
  "active",
  "overdue",
  "return_pending",
  "disputed",
];

/** States that stop all new reservations through the calendar guard. */
export const GUARD_BLOCKING_STATUSES: readonly BookingStatus[] = [
  "overdue",
  "return_pending",
  "disputed",
];

export const CLOSED_STATUSES: readonly BookingStatus[] = [
  "completed",
  "declined",
  "cancelled",
  "expired",
];

export function isClosedStatus(status: BookingStatus): boolean {
  return CLOSED_STATUSES.includes(status);
}

// ─── Commands ───

export const BOOKING_COMMANDS = [
  "accept",
  "decline",
  "confirm",
  "cancel",
  "submit_collection_condition",
  "acknowledge_collection",
  "submit_return_condition",
  "report_return",
  "confirm_receipt",
  "report_issue",
  "arrange_pickup",
  "arrange_return",
  "correct_collection_condition",
  "correct_return_condition",
] as const;

export type BookingCommand = (typeof BOOKING_COMMANDS)[number];

/** Who may run a command and from which states. */
export const COMMAND_RULES: Record<
  BookingCommand,
  { roles: readonly ParticipantRole[]; from: readonly BookingStatus[] }
> = {
  accept: { roles: ["owner"], from: ["pending"] },
  decline: { roles: ["owner"], from: ["pending"] },
  confirm: { roles: ["borrower"], from: ["accepted"] },
  cancel: { roles: ["owner", "borrower"], from: ["pending", "accepted", "confirmed"] },
  submit_collection_condition: { roles: ["owner"], from: ["confirmed"] },
  acknowledge_collection: { roles: ["borrower"], from: ["confirmed"] },
  submit_return_condition: { roles: ["borrower"], from: ["active", "overdue"] },
  report_return: { roles: ["borrower"], from: ["active", "overdue"] },
  confirm_receipt: { roles: ["owner"], from: ["return_pending"] },
  report_issue: { roles: ["owner", "borrower"], from: ["active", "overdue", "return_pending"] },
  arrange_pickup: { roles: ["owner", "borrower"], from: ["confirmed"] },
  arrange_return: { roles: ["owner", "borrower"], from: ["confirmed", "active", "overdue"] },
  // Sprint 3: a correction is a new version; the earlier record stays readable.
  correct_collection_condition: { roles: ["owner"], from: ["confirmed"] },
  correct_return_condition: { roles: ["borrower"], from: ["active", "overdue", "return_pending"] },
};

export function roleMayRun(command: BookingCommand, role: ParticipantRole): boolean {
  return COMMAND_RULES[command].roles.includes(role);
}

export function statusAllows(command: BookingCommand, status: BookingStatus): boolean {
  return COMMAND_RULES[command].from.includes(status);
}

export interface ExchangeProgress {
  hasCollectionReport: boolean;
  collectionAcknowledgement: "agreed" | "disagreed" | null;
  hasReturnReport: boolean;
}

/**
 * Commands the given participant can run now. The API enforces the same
 * rules; the interface uses this list so it never shows an action that the
 * server would refuse.
 */
export function availableCommands(
  role: ParticipantRole,
  status: BookingStatus,
  progress: ExchangeProgress,
): BookingCommand[] {
  return BOOKING_COMMANDS.filter((command) => {
    if (!roleMayRun(command, role) || !statusAllows(command, status)) return false;
    switch (command) {
      case "submit_collection_condition":
        return !progress.hasCollectionReport;
      case "acknowledge_collection":
        return (
          progress.hasCollectionReport &&
          progress.collectionAcknowledgement !== "agreed"
        );
      case "submit_return_condition":
        return !progress.hasReturnReport;
      case "correct_collection_condition":
        return progress.hasCollectionReport && progress.collectionAcknowledgement !== "agreed";
      case "correct_return_condition":
        return progress.hasReturnReport;
      default:
        return true;
    }
  });
}

// ─── Time ───

export function toMillis(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid timestamp: ${iso}`);
  }
  return ms;
}

/** Normalise any valid ISO timestamp to UTC with milliseconds and Z. */
export function normalizeIso(iso: string): string {
  return new Date(toMillis(iso)).toISOString();
}

export function addHours(iso: string, hours: number): string {
  return new Date(toMillis(iso) + hours * HOUR_MS).toISOString();
}

export function addDays(iso: string, days: number): string {
  return new Date(toMillis(iso) + days * DAY_MS).toISOString();
}

/** "2026-11-10T09:00" entered in Riyadh time → "2026-11-10T06:00:00.000Z". */
export function riyadhLocalToIso(local: string): string {
  const withSeconds = local.length === 16 ? `${local}:00` : local;
  return normalizeIso(`${withSeconds}${BOOKING_CONFIG.riyadhUtcOffset}`);
}

/** "2026-11-10T06:00:00.000Z" → "2026-11-10T09:00" in Riyadh time. */
export function isoToRiyadhLocal(iso: string): string {
  const shifted = new Date(toMillis(iso) + 3 * HOUR_MS);
  return shifted.toISOString().slice(0, 16);
}

/**
 * Expiry for a pending request or an accepted hold: a fixed number of hours
 * after the decision, never later than the pickup time.
 */
export function computeExpiry(
  kind: "pending" | "accepted",
  nowIso: string,
  startAtIso: string,
): string {
  const hours =
    kind === "pending"
      ? BOOKING_CONFIG.pendingExpiryHours
      : BOOKING_CONFIG.acceptedHoldExpiryHours;
  const candidate = toMillis(nowIso) + hours * HOUR_MS;
  return new Date(Math.min(candidate, toMillis(startAtIso))).toISOString();
}

export type SystemTransition = "expired" | "overdue";

/**
 * Transition that server time has made due, if any. Applied lazily on every
 * read and command, and by the optional sweep endpoint.
 */
export function dueSystemTransition(
  booking: { status: BookingStatus; expiresAt?: string | null; endAt: string },
  nowIso: string,
): SystemTransition | null {
  const now = toMillis(nowIso);
  if (
    (booking.status === "pending" || booking.status === "accepted") &&
    booking.expiresAt &&
    toMillis(booking.expiresAt) <= now
  ) {
    return "expired";
  }
  if (booking.status === "active" && toMillis(booking.endAt) <= now) {
    return "overdue";
  }
  return null;
}

// ─── Intervals ───

export interface Interval {
  startAt: string;
  endAt: string;
}

/** Half-open overlap: existing.startAt < requested.endAt && existing.endAt > requested.startAt. */
export function intervalsOverlap(existing: Interval, requested: Interval): boolean {
  return (
    toMillis(existing.startAt) < toMillis(requested.endAt) &&
    toMillis(existing.endAt) > toMillis(requested.startAt)
  );
}

export function findOverlaps<T extends Interval>(blocks: readonly T[], requested: Interval): T[] {
  return blocks.filter((b) => intervalsOverlap(b, requested));
}

/** Merge overlapping or touching intervals; output is sorted by start. */
export function mergeIntervals(intervals: readonly Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => toMillis(a.startAt) - toMillis(b.startAt));
  const merged: Interval[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (last && toMillis(current.startAt) <= toMillis(last.endAt)) {
      if (toMillis(current.endAt) > toMillis(last.endAt)) {
        last.endAt = current.endAt;
      }
    } else {
      merged.push({ startAt: current.startAt, endAt: current.endAt });
    }
  }
  return merged;
}

// ─── Money ───

/** Positive duration rounded up to whole 24-hour units. */
export function billableUnits(startAtIso: string, endAtIso: string): number {
  const durationMs = toMillis(endAtIso) - toMillis(startAtIso);
  if (durationMs <= 0) return 0;
  return Math.ceil(durationMs / (BOOKING_CONFIG.billingUnitHours * HOUR_MS));
}

export interface QuoteTerms {
  dailyRateHalalas: number;
  depositHalalas: number;
  minimumBillableDays: number;
}

export interface QuoteAmounts {
  billableDays: number;
  rentalFeeHalalas: number;
  depositHalalas: number;
  totalHalalas: number;
}

/** Rental fee and deposit stay separate; the total is only their sum. */
export function computeQuoteAmounts(
  terms: QuoteTerms,
  startAtIso: string,
  endAtIso: string,
): QuoteAmounts {
  const units = billableUnits(startAtIso, endAtIso);
  const billableDays = Math.max(units, terms.minimumBillableDays, 1);
  const rentalFeeHalalas = terms.dailyRateHalalas * billableDays;
  return {
    billableDays,
    rentalFeeHalalas,
    depositHalalas: terms.depositHalalas,
    totalHalalas: rentalFeeHalalas + terms.depositHalalas,
  };
}

export interface DepositBalances {
  capturedHalalas: number;
  heldHalalas: number;
  refundedHalalas: number;
  compensationHalalas: number;
}

/** Once captured: captured = held + refunded + compensation, all non-negative. */
export function depositInvariantHolds(d: DepositBalances): boolean {
  const values = [d.capturedHalalas, d.heldHalalas, d.refundedHalalas, d.compensationHalalas];
  if (values.some((v) => !Number.isInteger(v) || v < 0)) return false;
  return d.capturedHalalas === d.heldHalalas + d.refundedHalalas + d.compensationHalalas;
}

// ─── Date validation ───

export type DateProblem =
  | "not_set_up"
  | "invalid_range"
  | "in_past"
  | "beyond_horizon"
  | "outside_window"
  | "too_long";

export interface DateCheckInput {
  startAt: string;
  endAt: string;
  nowIso: string;
  bookableFrom?: string | null;
  bookableUntil?: string | null;
  minimumBillableDays: number;
  maximumBillableDays: number;
}

export type DateCheckResult =
  | { ok: true; billableDays: number }
  | { ok: false; problem: DateProblem; message: string };

export function checkBookingDates(input: DateCheckInput): DateCheckResult {
  if (!input.bookableFrom || !input.bookableUntil) {
    return { ok: false, problem: "not_set_up", message: "The owner has not set up booking for this item yet." };
  }
  const start = toMillis(input.startAt);
  const end = toMillis(input.endAt);
  const now = toMillis(input.nowIso);
  if (end <= start) {
    return { ok: false, problem: "invalid_range", message: "Return time must be after pickup time." };
  }
  if (start <= now) {
    return { ok: false, problem: "in_past", message: "Pickup time must be in the future." };
  }
  if (start > now + BOOKING_CONFIG.maxHorizonDays * DAY_MS) {
    return {
      ok: false,
      problem: "beyond_horizon",
      message: `Pickup can be at most ${BOOKING_CONFIG.maxHorizonDays} days ahead.`,
    };
  }
  if (start < toMillis(input.bookableFrom) || end > toMillis(input.bookableUntil)) {
    return {
      ok: false,
      problem: "outside_window",
      message: "These dates are outside the period the owner accepts bookings for.",
    };
  }
  const units = billableUnits(input.startAt, input.endAt);
  const maxDays = input.maximumBillableDays || BOOKING_CONFIG.defaultMaximumBillableDays;
  if (units > maxDays) {
    return {
      ok: false,
      problem: "too_long",
      message: `This item can be booked for at most ${maxDays} day${maxDays === 1 ? "" : "s"}.`,
    };
  }
  return { ok: true, billableDays: Math.max(units, input.minimumBillableDays, 1) };
}
