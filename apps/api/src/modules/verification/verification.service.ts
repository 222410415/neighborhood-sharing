/**
 * Verification checks.
 *
 * - Email: read from Firebase Authentication (emailVerified) and recorded as
 *   a real, non-simulated check. It is the only check shown as verified.
 * - Phone and identity: demonstration checks only, always isSimulated, decided
 *   by an admin, and shown publicly as "Demo check (simulated)". No identity
 *   documents are collected.
 */

import { Injectable } from "@nestjs/common";
import type {
  DecideVerificationBody,
  VerificationCheckDto,
  VerificationStatusDto,
} from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import { ConflictException, NotFoundException } from "../../common/errors/api-exceptions.js";
import type { NotificationDoc } from "../exchange/exchange.types.js";
import { WriteBuffer } from "../exchange/write-buffer.js";
import { MemberDirectory } from "../exchange/member-directory.service.js";
import { AuditService } from "../roles/audit.service.js";
import { labelsFor } from "./verification-labels.js";

const checkId = (uid: string, type: string) => `vc_${uid}_${type}`;

@Injectable()
export class VerificationService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly members: MemberDirectory,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  private ref(id: string) {
    return this.db.collection(COLLECTIONS.verificationChecks).doc(id);
  }

  private async checksOf(uid: string): Promise<VerificationCheckDto[]> {
    const snap = await this.db.collection(COLLECTIONS.verificationChecks).where("subjectUid", "==", uid).get();
    return snap.docs.map((d) => d.data() as VerificationCheckDto).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  private async emailVerified(uid: string): Promise<boolean> {
    try {
      return (await this.firebase.auth.getUser(uid)).emailVerified;
    } catch {
      return false;
    }
  }

  async status(uid: string): Promise<VerificationStatusDto> {
    const [emailVerified, checks] = await Promise.all([this.emailVerified(uid), this.checksOf(uid)]);
    return { emailVerified, checks, labels: labelsFor(checks) };
  }

  /** Record the current Firebase email verification state. */
  async syncEmail(uid: string): Promise<VerificationStatusDto> {
    const verified = await this.emailVerified(uid);
    const now = new Date().toISOString();
    const ref = this.ref(checkId(uid, "email"));
    const existing = (await ref.get()).data() as VerificationCheckDto | undefined;
    const check: VerificationCheckDto = {
      id: ref.id,
      subjectUid: uid,
      type: "email",
      method: "firebase_email_link",
      status: verified ? "verified" : "pending",
      isSimulated: false,
      reviewerUid: null,
      checkedAt: verified ? (existing?.status === "verified" ? existing.checkedAt : now) : null,
      reasonCode: verified ? "firebase_email_verified" : "awaiting_email_link",
      createdAt: existing?.createdAt ?? now,
    };
    await ref.set(check);
    return this.status(uid);
  }

  /** Request a labelled demonstration check (no documents collected). */
  async requestDemoCheck(uid: string, type: "phone_demo" | "identity_demo"): Promise<VerificationCheckDto> {
    const ref = this.ref(checkId(uid, type));
    return this.db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      const existing = (await tx.get(ref)).data() as VerificationCheckDto | undefined;
      if (existing && existing.status !== "rejected") return existing;
      const check: VerificationCheckDto = {
        id: ref.id,
        subjectUid: uid,
        type,
        method: "demonstration",
        status: "pending",
        isSimulated: true,
        reviewerUid: null,
        checkedAt: null,
        reasonCode: null,
        createdAt: now,
      };
      tx.set(ref, check);
      return check;
    });
  }

  // ─── Admins ───

  async queue(reviewerUid: string) {
    const snap = await this.db.collection(COLLECTIONS.verificationChecks).where("status", "==", "pending").get();
    const checks = snap.docs
      .map((d) => d.data() as VerificationCheckDto)
      .filter((c) => c.isSimulated)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const names = await this.members.displayNames(checks.map((c) => c.subjectUid));
    return checks.map((c) => ({
      id: c.id,
      status: c.status,
      type: c.type,
      subjectUid: c.subjectUid,
      subjectName: names.get(c.subjectUid) ?? "Member",
      createdAt: c.createdAt,
      assignedReviewerUid: null,
      assignedToMe: false,
      conflict: c.subjectUid === reviewerUid,
    }));
  }

  async decide(
    reviewerUid: string,
    id: string,
    body: DecideVerificationBody,
    requestId: string | null,
  ): Promise<VerificationCheckDto> {
    return this.db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      const check = (await tx.get(this.ref(id))).data() as VerificationCheckDto | undefined;
      if (!check || !check.isSimulated) throw new NotFoundException("Check not found");
      if (check.subjectUid === reviewerUid) {
        throw new ConflictException("You cannot decide your own check.", { reason: "conflict_of_interest" });
      }
      if (check.status !== "pending") throw new ConflictException("This check was already decided.");
      const decided: VerificationCheckDto = {
        ...check,
        status: body.decision,
        reviewerUid,
        checkedAt: now,
        reasonCode: body.reasonCode,
      };
      const notification: NotificationDoc = {
        id: `ntf_${id}_${now.replace(/[-:.TZ]/g, "")}`,
        recipientUid: check.subjectUid,
        type: "verification_decided",
        entityType: "verification",
        entityId: id,
        title: body.decision === "verified" ? "Demo check passed (simulated)" : "Demo check not passed",
        body:
          body.decision === "verified"
            ? "Your profile now shows a demonstration check label. It is simulated and is not identity verification."
            : "Your demonstration check was not passed. You can request it again.",
        actionPath: "/profile/verification",
        createdAt: now,
        readAt: null,
      };
      const buffer = new WriteBuffer();
      buffer.set(this.ref(id), decided);
      buffer.set(this.db.collection(COLLECTIONS.notifications).doc(notification.id), notification);
      this.audit.inBuffer(buffer, this.db, {
        actorUid: reviewerUid,
        action: `verification.${body.decision}`,
        entityType: "verificationCheck",
        entityId: id,
        requestId,
        summary: { type: check.type, reasonCode: body.reasonCode },
      }, now);
      buffer.flush(tx);
      return decided;
    });
  }
}
