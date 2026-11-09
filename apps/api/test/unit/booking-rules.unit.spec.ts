/**
 * Unit tests for the pure Sprint 2 booking rules.
 * These import the contracts source directly (no NestJS, no Firebase), so they
 * run under the CommonJS Jest setup.
 */

import {
  ALLOWED_TRANSITIONS,
  BOOKING_STATUSES,
  availableCommands,
  billableUnits,
  canTransition,
  checkBookingDates,
  computeExpiry,
  computeQuoteAmounts,
  depositInvariantHolds,
  dueReminder,
  dueSystemTransition,
  findOverlaps,
  intervalsOverlap,
  isoToRiyadhLocal,
  mergeIntervals,
  normalizeIso,
  riyadhLocalToIso,
} from "../../../../packages/contracts/src/booking/booking-rules";
import { BOOKING_CONFIG } from "../../../../packages/contracts/src/booking/booking-config";

const NOW = "2026-11-03T09:00:00.000Z";

describe("billable days", () => {
  it("rounds a positive duration up to whole 24-hour units", () => {
    expect(billableUnits("2026-11-05T06:00:00.000Z", "2026-11-05T09:00:00.000Z")).toBe(1);
    expect(billableUnits("2026-11-05T06:00:00.000Z", "2026-11-06T06:00:00.000Z")).toBe(1);
    expect(billableUnits("2026-11-05T06:00:00.000Z", "2026-11-06T06:00:00.001Z")).toBe(2);
    expect(billableUnits("2026-11-05T06:00:00.000Z", "2026-11-08T05:00:00.000Z")).toBe(3);
  });

  it("returns zero for an empty or reversed interval", () => {
    expect(billableUnits("2026-11-05T06:00:00.000Z", "2026-11-05T06:00:00.000Z")).toBe(0);
    expect(billableUnits("2026-11-06T06:00:00.000Z", "2026-11-05T06:00:00.000Z")).toBe(0);
  });
});

describe("quote amounts", () => {
  it("keeps the rental fee and the deposit separate", () => {
    const q = computeQuoteAmounts(
      { dailyRateHalalas: 1500, depositHalalas: 10000, minimumBillableDays: 1 },
      "2026-11-05T06:00:00.000Z",
      "2026-11-07T06:00:00.000Z",
    );
    expect(q).toEqual({
      billableDays: 2,
      rentalFeeHalalas: 3000,
      depositHalalas: 10000,
      totalHalalas: 13000,
    });
  });

  it("quotes a free item with a deposit as zero fee plus the deposit", () => {
    const q = computeQuoteAmounts(
      { dailyRateHalalas: 0, depositHalalas: 5000, minimumBillableDays: 1 },
      "2026-11-05T06:00:00.000Z",
      "2026-11-05T10:00:00.000Z",
    );
    expect(q.rentalFeeHalalas).toBe(0);
    expect(q.depositHalalas).toBe(5000);
    expect(q.totalHalalas).toBe(5000);
    expect(q.billableDays).toBe(1);
  });

  it("applies the listing's minimum billable days", () => {
    const q = computeQuoteAmounts(
      { dailyRateHalalas: 2000, depositHalalas: 0, minimumBillableDays: 2 },
      "2026-11-05T06:00:00.000Z",
      "2026-11-05T10:00:00.000Z",
    );
    expect(q.billableDays).toBe(2);
    expect(q.rentalFeeHalalas).toBe(4000);
  });
});

describe("interval overlap (half-open)", () => {
  const a = { startAt: "2026-11-05T06:00:00.000Z", endAt: "2026-11-06T06:00:00.000Z" };

  it("detects overlapping intervals", () => {
    expect(intervalsOverlap(a, { startAt: "2026-11-05T12:00:00.000Z", endAt: "2026-11-07T00:00:00.000Z" })).toBe(true);
    expect(intervalsOverlap(a, { startAt: "2026-11-04T00:00:00.000Z", endAt: "2026-11-08T00:00:00.000Z" })).toBe(true);
  });

  it("treats touching intervals as not overlapping", () => {
    expect(intervalsOverlap(a, { startAt: "2026-11-06T06:00:00.000Z", endAt: "2026-11-07T06:00:00.000Z" })).toBe(false);
    expect(intervalsOverlap(a, { startAt: "2026-11-04T06:00:00.000Z", endAt: "2026-11-05T06:00:00.000Z" })).toBe(false);
  });

  it("finds only the overlapping blocks", () => {
    const blocks = [
      { id: "b1", ...a },
      { id: "b2", startAt: "2026-11-10T00:00:00.000Z", endAt: "2026-11-11T00:00:00.000Z" },
    ];
    const hits = findOverlaps(blocks, { startAt: "2026-11-05T20:00:00.000Z", endAt: "2026-11-09T00:00:00.000Z" });
    expect(hits.map((b) => b.id)).toEqual(["b1"]);
  });

  it("merges overlapping and touching intervals for the public view", () => {
    const merged = mergeIntervals([
      { startAt: "2026-11-07T00:00:00.000Z", endAt: "2026-11-08T00:00:00.000Z" },
      { startAt: "2026-11-05T00:00:00.000Z", endAt: "2026-11-06T00:00:00.000Z" },
      { startAt: "2026-11-06T00:00:00.000Z", endAt: "2026-11-06T12:00:00.000Z" },
    ]);
    expect(merged).toEqual([
      { startAt: "2026-11-05T00:00:00.000Z", endAt: "2026-11-06T12:00:00.000Z" },
      { startAt: "2026-11-07T00:00:00.000Z", endAt: "2026-11-08T00:00:00.000Z" },
    ]);
  });
});

describe("expiry", () => {
  it("expires a pending request after 48 hours", () => {
    expect(computeExpiry("pending", NOW, "2026-11-20T06:00:00.000Z")).toBe("2026-11-05T09:00:00.000Z");
  });

  it("expires an accepted hold after 24 hours", () => {
    expect(computeExpiry("accepted", NOW, "2026-11-20T06:00:00.000Z")).toBe("2026-11-04T09:00:00.000Z");
  });

  it("never extends beyond pickup time", () => {
    expect(computeExpiry("pending", NOW, "2026-11-03T15:00:00.000Z")).toBe("2026-11-03T15:00:00.000Z");
    expect(computeExpiry("accepted", NOW, "2026-11-03T10:00:00.000Z")).toBe("2026-11-03T10:00:00.000Z");
  });

  it("marks due system transitions from server time", () => {
    const endAt = "2026-11-03T08:00:00.000Z";
    expect(dueSystemTransition({ status: "pending", expiresAt: "2026-11-03T08:59:59.999Z", endAt }, NOW)).toBe("expired");
    expect(dueSystemTransition({ status: "accepted", expiresAt: NOW, endAt }, NOW)).toBe("expired");
    expect(dueSystemTransition({ status: "accepted", expiresAt: "2026-11-03T09:00:00.001Z", endAt }, NOW)).toBeNull();
    expect(dueSystemTransition({ status: "confirmed", expiresAt: null, endAt }, NOW)).toBeNull();
    expect(dueSystemTransition({ status: "active", expiresAt: null, endAt }, NOW)).toBe("overdue");
    expect(dueSystemTransition({ status: "active", expiresAt: null, endAt: "2026-11-04T00:00:00.000Z" }, NOW)).toBeNull();
    expect(dueSystemTransition({ status: "overdue", expiresAt: null, endAt }, NOW)).toBeNull();
  });
});

describe("reminders", () => {
  const at = (h: number) => new Date(Date.parse(NOW) + h * 3_600_000).toISOString();

  it("sends a pickup reminder for a confirmed booking within the lead time", () => {
    expect(dueReminder({ status: "confirmed", startAt: at(23), endAt: at(47) }, NOW, 24)).toBe("pickup");
    expect(dueReminder({ status: "confirmed", startAt: at(24), endAt: at(48) }, NOW, 24)).toBe("pickup");
    expect(dueReminder({ status: "confirmed", startAt: at(25), endAt: at(49) }, NOW, 24)).toBeNull();
    // Pickup time passed without a handover, return time not yet reached.
    expect(dueReminder({ status: "confirmed", startAt: at(-2), endAt: at(10) }, NOW, 24)).toBe("pickup");
  });

  it("sends a return reminder for an active booking within the lead time", () => {
    expect(dueReminder({ status: "active", startAt: at(-5), endAt: at(3) }, NOW, 24)).toBe("return");
    expect(dueReminder({ status: "active", startAt: at(-5), endAt: at(30) }, NOW, 24)).toBeNull();
  });

  it("sends nothing once the return time has passed or for other states", () => {
    expect(dueReminder({ status: "active", startAt: at(-30), endAt: at(-1) }, NOW, 24)).toBeNull();
    expect(dueReminder({ status: "confirmed", startAt: at(-30), endAt: NOW }, NOW, 24)).toBeNull();
    for (const status of ["pending", "accepted", "overdue", "return_pending", "completed", "cancelled"] as const) {
      expect(dueReminder({ status, startAt: at(1), endAt: at(5) }, NOW, 24)).toBeNull();
    }
  });

  it("uses the configured lead time by default", () => {
    const lead = BOOKING_CONFIG.reminderLeadHours;
    expect(dueReminder({ status: "confirmed", startAt: at(lead), endAt: at(lead + 24) }, NOW)).toBe("pickup");
    expect(dueReminder({ status: "confirmed", startAt: at(lead + 1), endAt: at(lead + 25) }, NOW)).toBeNull();
  });
});

describe("deposit invariant", () => {
  it("holds when captured = held + refunded + compensation", () => {
    expect(depositInvariantHolds({ capturedHalalas: 10000, heldHalalas: 10000, refundedHalalas: 0, compensationHalalas: 0 })).toBe(true);
    expect(depositInvariantHolds({ capturedHalalas: 10000, heldHalalas: 0, refundedHalalas: 10000, compensationHalalas: 0 })).toBe(true);
    expect(depositInvariantHolds({ capturedHalalas: 0, heldHalalas: 0, refundedHalalas: 0, compensationHalalas: 0 })).toBe(true);
  });

  it("fails on mismatched or negative balances", () => {
    expect(depositInvariantHolds({ capturedHalalas: 10000, heldHalalas: 5000, refundedHalalas: 0, compensationHalalas: 0 })).toBe(false);
    expect(depositInvariantHolds({ capturedHalalas: 10000, heldHalalas: 12000, refundedHalalas: -2000, compensationHalalas: 0 })).toBe(false);
    expect(depositInvariantHolds({ capturedHalalas: 100.5, heldHalalas: 100.5, refundedHalalas: 0, compensationHalalas: 0 })).toBe(false);
  });
});

describe("state transitions", () => {
  it("covers all eleven states", () => {
    expect(BOOKING_STATUSES).toHaveLength(11);
    expect(Object.keys(ALLOWED_TRANSITIONS).sort()).toEqual([...BOOKING_STATUSES].sort());
  });

  it("follows the design table", () => {
    expect(canTransition("pending", "accepted")).toBe(true);
    expect(canTransition("pending", "confirmed")).toBe(false);
    expect(canTransition("accepted", "confirmed")).toBe(true);
    expect(canTransition("confirmed", "active")).toBe(true);
    expect(canTransition("confirmed", "expired")).toBe(false);
    expect(canTransition("active", "cancelled")).toBe(false);
    expect(canTransition("active", "overdue")).toBe(true);
    expect(canTransition("overdue", "return_pending")).toBe(true);
    expect(canTransition("return_pending", "completed")).toBe(true);
    expect(canTransition("return_pending", "disputed")).toBe(true);
    expect(canTransition("completed", "disputed")).toBe(false);
  });

  it("keeps closed states terminal", () => {
    for (const s of ["completed", "declined", "cancelled", "expired"] as const) {
      expect(ALLOWED_TRANSITIONS[s]).toHaveLength(0);
    }
  });

  it("offers each participant only their own actions", () => {
    const none = { hasCollectionReport: false, collectionAcknowledgement: null, hasReturnReport: false };
    expect(availableCommands("owner", "pending", none)).toEqual(["accept", "decline", "cancel"]);
    expect(availableCommands("borrower", "pending", none)).toEqual(["cancel"]);
    expect(availableCommands("borrower", "accepted", none)).toEqual(["confirm", "cancel"]);
    expect(availableCommands("owner", "confirmed", none)).toEqual([
      "cancel",
      "submit_collection_condition",
      "arrange_pickup",
      "arrange_return",
    ]);
    expect(availableCommands("borrower", "confirmed", none)).not.toContain("acknowledge_collection");
    const recorded = { ...none, hasCollectionReport: true };
    expect(availableCommands("borrower", "confirmed", recorded)).toContain("acknowledge_collection");
    expect(availableCommands("owner", "confirmed", recorded)).not.toContain("submit_collection_condition");
    expect(availableCommands("owner", "return_pending", none)).toEqual(["confirm_receipt", "report_issue"]);
    // Sprint 3: corrections are new versions, only by the author's role and before the next step.
    expect(availableCommands("owner", "confirmed", recorded)).toContain("correct_collection_condition");
    expect(availableCommands("borrower", "confirmed", recorded)).not.toContain("correct_collection_condition");
    const agreed = { ...recorded, collectionAcknowledgement: "agreed" as const };
    expect(availableCommands("owner", "confirmed", agreed)).not.toContain("correct_collection_condition");
    const returned = { ...none, hasReturnReport: true };
    expect(availableCommands("borrower", "return_pending", returned)).toContain("correct_return_condition");
    expect(availableCommands("borrower", "completed", returned)).not.toContain("correct_return_condition");
    expect(availableCommands("borrower", "disputed", none)).toEqual([]);
  });
});

describe("booking date checks", () => {
  const base = {
    nowIso: NOW,
    bookableFrom: "2026-11-01T00:00:00.000Z",
    bookableUntil: "2026-12-31T00:00:00.000Z",
    minimumBillableDays: 1,
    maximumBillableDays: 14,
  };

  it("accepts valid dates and returns billable days", () => {
    const r = checkBookingDates({ ...base, startAt: "2026-11-10T06:00:00.000Z", endAt: "2026-11-12T06:00:00.000Z" });
    expect(r).toEqual({ ok: true, billableDays: 2 });
  });

  it("refuses an item without booking set up", () => {
    const r = checkBookingDates({ ...base, bookableFrom: null, startAt: "2026-11-10T06:00:00.000Z", endAt: "2026-11-12T06:00:00.000Z" });
    expect(r.ok === false && r.problem).toBe("not_set_up");
  });

  it("refuses reversed, past, distant, out-of-window and too-long requests", () => {
    const problem = (startAt: string, endAt: string, extra = {}) => {
      const r = checkBookingDates({ ...base, ...extra, startAt, endAt });
      return r.ok ? null : r.problem;
    };
    expect(problem("2026-11-12T06:00:00.000Z", "2026-11-10T06:00:00.000Z")).toBe("invalid_range");
    expect(problem("2026-11-02T06:00:00.000Z", "2026-11-04T06:00:00.000Z")).toBe("in_past");
    expect(problem("2027-03-01T06:00:00.000Z", "2027-03-02T06:00:00.000Z", { bookableUntil: "2027-12-31T00:00:00.000Z" })).toBe("beyond_horizon");
    expect(problem("2026-12-30T06:00:00.000Z", "2027-01-02T06:00:00.000Z")).toBe("outside_window");
    expect(problem("2026-11-10T06:00:00.000Z", "2026-11-25T06:00:00.000Z")).toBe("too_long");
  });

  it("uses the configured horizon", () => {
    expect(BOOKING_CONFIG.maxHorizonDays).toBe(90);
  });
});

describe("Riyadh time conversion", () => {
  it("interprets local input as UTC+03:00 and normalises with milliseconds and Z", () => {
    expect(riyadhLocalToIso("2026-11-10T09:00")).toBe("2026-11-10T06:00:00.000Z");
    expect(isoToRiyadhLocal("2026-11-10T06:00:00.000Z")).toBe("2026-11-10T09:00");
    expect(normalizeIso("2026-11-10T09:00:00+03:00")).toBe("2026-11-10T06:00:00.000Z");
  });
});
