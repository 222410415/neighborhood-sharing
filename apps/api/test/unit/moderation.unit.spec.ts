/**
 * Unit tests for the moderation rules (D-42) and the account status check
 * used by the auth guards. No NestJS, no Firebase: the database is a fake.
 */

import {
  DECISION_SEVERITY,
  SUGGESTED_SEVERITY,
  decideReportBodySchema,
  decisionsFor,
} from "../../../../packages/contracts/src/trust/trust-contracts";
import { forgetAccountStatus, isSuspended } from "../../src/common/guards/account-status";

function fakeDb(status: Record<string, string | undefined>) {
  let reads = 0;
  const db = {
    doc: (uid: string) => ({
      get: async () => {
        reads++;
        const accountStatus = status[uid];
        return { exists: accountStatus !== undefined, data: () => ({ accountStatus }) };
      },
    }),
  };
  return { db, reads: () => reads };
}

describe("moderation rules", () => {
  it("maps each decision to one severity level", () => {
    expect(DECISION_SEVERITY).toEqual({ invalid: null, warn: "low", take_down: "medium", suspend: "high" });
  });

  it("offers no take-down for a member report", () => {
    expect(decisionsFor("member")).toEqual(["invalid", "warn", "suspend"]);
    for (const t of ["listing", "message", "review"] as const) {
      expect(decisionsFor(t)).toEqual(["invalid", "warn", "take_down", "suspend"]);
    }
  });

  it("suggests high severity for unsafe and fraud, low for spam", () => {
    expect(SUGGESTED_SEVERITY.unsafe).toBe("high");
    expect(SUGGESTED_SEVERITY.fraud).toBe("high");
    expect(SUGGESTED_SEVERITY.spam).toBe("low");
  });

  it("requires a note and a known decision", () => {
    expect(decideReportBodySchema.safeParse({ decision: "warn", note: "  " }).success).toBe(false);
    expect(decideReportBodySchema.safeParse({ decision: "ban", note: "x" }).success).toBe(false);
    expect(decideReportBodySchema.safeParse({ decision: "suspend", note: "Repeated harassment" }).success).toBe(true);
  });
});

describe("account status check", () => {
  it("caches active members but never a suspension", async () => {
    const { db, reads } = fakeDb({ u_active: "active", u_susp: "suspended" });
    forgetAccountStatus("u_active");
    forgetAccountStatus("u_susp");
    expect(await isSuspended(db, "u_active")).toBe(false);
    expect(await isSuspended(db, "u_active")).toBe(false);
    expect(reads()).toBe(1);
    expect(await isSuspended(db, "u_susp")).toBe(true);
    expect(await isSuspended(db, "u_susp")).toBe(true);
    expect(reads()).toBe(3);
  });

  it("treats a member without a profile as active, and forgetting forces a fresh read", async () => {
    const status: Record<string, string | undefined> = {};
    const { db, reads } = fakeDb(status);
    forgetAccountStatus("u_new");
    expect(await isSuspended(db, "u_new")).toBe(false);
    status["u_new"] = "suspended";
    expect(await isSuspended(db, "u_new")).toBe(false); // cached as active
    forgetAccountStatus("u_new");
    expect(await isSuspended(db, "u_new")).toBe(true);
    expect(reads()).toBe(2);
  });
});
