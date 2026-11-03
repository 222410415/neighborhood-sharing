/**
 * Public verification labels. Only two exist: "Email verified" (from Firebase)
 * and "Demo check (simulated)". A demonstration check never reads as identity
 * verification, and the legacy profile field `verificationStatus` is ignored.
 */

import type { Firestore } from "firebase-admin/firestore";
import type { VerificationCheckDto, VerificationLabelDto } from "@neighborhood/contracts";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";

export async function verifiedChecks(db: Firestore, uid: string): Promise<VerificationCheckDto[]> {
  const snap = await db
    .collection(COLLECTIONS.verificationChecks)
    .where("subjectUid", "==", uid)
    .where("status", "==", "verified")
    .get();
  return snap.docs.map((d) => d.data() as VerificationCheckDto);
}

export function labelsFor(checks: VerificationCheckDto[]): VerificationLabelDto[] {
  const labels: VerificationLabelDto[] = [];
  if (checks.some((c) => c.type === "email" && c.status === "verified" && !c.isSimulated)) {
    labels.push({ label: "Email verified", isSimulated: false });
  }
  if (checks.some((c) => c.type !== "email" && c.status === "verified")) {
    labels.push({ label: "Demo check (simulated)", isSimulated: true });
  }
  return labels;
}
