/**
 * Dispute cases.
 *
 * Participants view their case and add statements. An admin
 * assigns the case to themselves, reads the evidence (audited) and resolves
 * it with a rationale, an item outcome and a deposit allocation where
 * refund + compensation equals the held amount. Resolution writes simulated
 * payment records for both parts, settles the deposit, completes the booking
 * and notifies both members, all in one calendar-guard transaction.
 *
 * An admin who is the booking's owner or borrower is refused (409) and the
 * case stays waiting for another admin. Lost or needs-repair outcomes keep
 * the item unavailable and pause the listing until the owner republishes it.
 */

import { Injectable } from "@nestjs/common";
import {
  TRUST_CONFIG,
  depositInvariantHolds,
  toMillis,
  type DisputeDto,
  type ItemOutcome,
  type ResolveDisputeBody,
} from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import {
  ConflictException,
  NotFoundException,
  ValidationException,
} from "../../common/errors/api-exceptions.js";
import { formatSar } from "../../common/format.js";
import type { ListingDocument } from "../listings/listing.repository.js";
import type { MediaDocument } from "../media/media.repository.js";
import { CalendarGuardService } from "../exchange/calendar-guard.service.js";
import { BookingEventWriter } from "../exchange/booking-event-writer.js";
import { WriteBuffer } from "../exchange/write-buffer.js";
import { MemberDirectory } from "../exchange/member-directory.service.js";
import { ids } from "../exchange/ids.js";
import type {
  BookingDoc,
  BookingEventDoc,
  ConditionReportDoc,
  DepositDoc,
  DisputeDoc,
  NotificationDoc,
  PaymentDoc,
  ReportDoc,
} from "../exchange/exchange.types.js";
import { SYSTEM_ACTOR } from "../exchange/exchange.types.js";
import { AuditService } from "../roles/audit.service.js";

export const OUTCOME_LABELS: Record<ItemOutcome, string> = {
  returned_ok: "returned in good order",
  returned_damaged: "returned damaged",
  lost: "lost",
  needs_repair: "needs repair",
};

function participantRole(booking: BookingDoc, uid: string): "owner" | "borrower" | null {
  if (uid === booking.ownerUid) return "owner";
  if (uid === booking.borrowerUid) return "borrower";
  return null;
}

function caseNotification(
  id: string,
  recipientUid: string,
  dispute: DisputeDoc,
  type: NotificationDoc["type"],
  title: string,
  body: string,
  now: string,
): NotificationDoc {
  return {
    id,
    recipientUid,
    type,
    entityType: "dispute",
    entityId: dispute.id,
    title,
    body,
    actionPath: `/bookings/${dispute.bookingId}/dispute`,
    createdAt: now,
    readAt: null,
  };
}

@Injectable()
export class DisputeService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly calendar: CalendarGuardService,
    private readonly members: MemberDirectory,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  private ref(id: string) {
    return this.db.collection(COLLECTIONS.disputes).doc(id);
  }

  private async load(id: string): Promise<{ dispute: DisputeDoc; booking: BookingDoc }> {
    const dispute = (await this.ref(id).get()).data() as DisputeDoc | undefined;
    if (!dispute) throw new NotFoundException("Case not found");
    const booking = (await this.db.collection(COLLECTIONS.bookings).doc(dispute.bookingId).get()).data() as
      | BookingDoc
      | undefined;
    if (!booking) throw new NotFoundException("Case not found");
    return { dispute, booking };
  }

  // ─── Participants ───

  /** GET /me/disputes/:id — participants only (404 for anyone else). */
  async getForParticipant(uid: string, id: string): Promise<DisputeDto> {
    const { dispute, booking } = await this.load(id);
    if (!participantRole(booking, uid)) throw new NotFoundException("Case not found");
    return dispute;
  }

  async addStatement(uid: string, id: string, text: string): Promise<DisputeDto> {
    const pre = await this.load(id);
    const role = participantRole(pre.booking, uid);
    if (!role) throw new NotFoundException("Case not found");
    const authorName = await this.members.displayName(uid);
    return this.db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      const dispute = (await tx.get(this.ref(id))).data() as DisputeDoc;
      if (dispute.status === "resolved") throw new ConflictException("This case is already resolved.");
      if (dispute.statements.length >= TRUST_CONFIG.maxDisputeStatements) {
        throw new ConflictException("This case has reached the maximum number of statements.");
      }
      const updated: DisputeDoc = {
        ...dispute,
        statements: [...dispute.statements, { byUid: uid, byRole: role, text, at: now }],
        revision: dispute.revision + 1,
        updatedAt: now,
      };
      const buffer = new WriteBuffer();
      buffer.set(this.ref(id), updated);
      const recipients = [
        uid === pre.booking.ownerUid ? pre.booking.borrowerUid : pre.booking.ownerUid,
        ...(dispute.assignedReviewerUid ? [dispute.assignedReviewerUid] : []),
      ];
      for (const recipient of recipients) {
        const n = caseNotification(
          `ntf_dsp_${id}_st${updated.statements.length}_${recipient}`,
          recipient,
          dispute,
          "dispute_statement",
          "New statement in a case",
          `${authorName} added a statement to the case about ${pre.booking.termsSnapshot.titleEn}.`,
          now,
        );
        if (recipient === dispute.assignedReviewerUid) n.actionPath = `/admin/disputes/${id}`;
        buffer.set(this.db.collection(COLLECTIONS.notifications).doc(n.id), n);
      }
      buffer.flush(tx);
      return updated;
    });
  }

  // ─── Admins ───

  async queue(reviewerUid: string) {
    const snaps = await Promise.all(
      (["open", "in_review"] as const).map((status) =>
        this.db.collection(COLLECTIONS.disputes).where("status", "==", status).get(),
      ),
    );
    const disputes = snaps
      .flatMap((s) => s.docs.map((d) => d.data() as DisputeDoc))
      .sort((a, b) => toMillis(a.createdAt) - toMillis(b.createdAt));
    const bookings = disputes.length
      ? await this.db.getAll(...disputes.map((d) => this.db.collection(COLLECTIONS.bookings).doc(d.bookingId)))
      : [];
    return disputes.map((d, i) => {
      const booking = bookings[i]?.data() as BookingDoc | undefined;
      return {
        id: d.id,
        bookingId: d.bookingId,
        kind: d.kind,
        issue: d.issue,
        status: d.status,
        itemTitle: booking?.termsSnapshot.titleEn ?? "Booking",
        heldDepositHalalas: d.heldDepositHalalas,
        createdAt: d.createdAt,
        assignedReviewerUid: d.assignedReviewerUid,
        assignedToMe: d.assignedReviewerUid === reviewerUid,
        conflict: !!booking && !!participantRole(booking, reviewerUid),
      };
    });
  }

  private assertNoConflict(booking: BookingDoc, reviewerUid: string): void {
    if (participantRole(booking, reviewerUid)) {
      throw new ConflictException(
        "You are the owner or borrower in this booking, so another admin must decide this case. It stays waiting for review.",
        { reason: "conflict_of_interest" },
      );
    }
  }

  async assign(reviewerUid: string, id: string, requestId: string | null): Promise<DisputeDto> {
    const pre = await this.load(id);
    this.assertNoConflict(pre.booking, reviewerUid);
    return this.db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      const dispute = (await tx.get(this.ref(id))).data() as DisputeDoc;
      if (dispute.status === "resolved") throw new ConflictException("This case is already resolved.");
      if (dispute.assignedReviewerUid && dispute.assignedReviewerUid !== reviewerUid) {
        throw new ConflictException("Another admin is already handling this case.");
      }
      if (dispute.assignedReviewerUid === reviewerUid) return dispute;
      const updated: DisputeDoc = {
        ...dispute,
        status: "in_review",
        assignedReviewerUid: reviewerUid,
        revision: dispute.revision + 1,
        updatedAt: now,
      };
      const buffer = new WriteBuffer();
      buffer.set(this.ref(id), updated);
      for (const recipient of [pre.booking.ownerUid, pre.booking.borrowerUid]) {
        const n = caseNotification(
          `ntf_dsp_${id}_assigned_${recipient}`,
          recipient,
          dispute,
          "dispute_assigned",
          "An admin is looking at your case",
          `An admin is now reviewing the case about ${pre.booking.termsSnapshot.titleEn}.`,
          now,
        );
        buffer.set(this.db.collection(COLLECTIONS.notifications).doc(n.id), n);
      }
      this.audit.inBuffer(buffer, this.db, {
        actorUid: reviewerUid,
        action: "dispute.assign",
        entityType: "dispute",
        entityId: id,
        requestId,
      }, now);
      buffer.flush(tx);
      return updated;
    });
  }

  private assertAssigned(dispute: DisputeDoc, reviewerUid: string): void {
    if (dispute.assignedReviewerUid !== reviewerUid) {
      throw new ConflictException("Assign this case to yourself before working on it.", { reason: "not_assigned" });
    }
  }

  /** Case evidence for the assigned admin; every read is audited. */
  async evidence(reviewerUid: string, id: string, requestId: string | null) {
    const { dispute, booking } = await this.load(id);
    this.assertNoConflict(booking, reviewerUid);
    this.assertAssigned(dispute, reviewerUid);
    const db = this.db;
    const [eventsSnap, paymentsSnap, reportsSnap, depositSnap] = await Promise.all([
      db.collection(COLLECTIONS.bookingEvents).where("bookingId", "==", booking.id).get(),
      db.collection(COLLECTIONS.payments).where("bookingId", "==", booking.id).get(),
      db.collection(COLLECTIONS.conditionReports).where("bookingId", "==", booking.id).get(),
      db.collection(COLLECTIONS.deposits).doc(booking.id).get(),
    ]);
    const linkedReports = dispute.linkedReportIds.length
      ? (await db.getAll(...dispute.linkedReportIds.map((r) => db.collection(COLLECTIONS.reports).doc(r))))
          .filter((s) => s.exists)
          .map((s) => {
            const r = s.data() as ReportDoc;
            return { id: r.id, category: r.category, description: r.description, status: r.status };
          })
      : [];
    await this.audit.record({
      actorUid: reviewerUid,
      action: "dispute.read_evidence",
      entityType: "dispute",
      entityId: id,
      requestId,
    });
    const names = await this.members.displayNames([booking.ownerUid, booking.borrowerUid]);
    const { clientRequestId: _c, conversationId: _v, ...bookingDto } = booking;
    return {
      dispute,
      booking: bookingDto,
      owner: { uid: booking.ownerUid, displayName: names.get(booking.ownerUid) ?? "Member" },
      borrower: { uid: booking.borrowerUid, displayName: names.get(booking.borrowerUid) ?? "Member" },
      events: eventsSnap.docs.map((d) => d.data() as BookingEventDoc).sort((a, b) => a.sequence - b.sequence),
      payments: paymentsSnap.docs.map((d) => d.data() as PaymentDoc),
      deposit: depositSnap.exists ? (depositSnap.data() as DepositDoc) : null,
      conditionReports: reportsSnap.docs
        .map((d) => {
          const { clientRequestId: _r, ...report } = d.data() as ConditionReportDoc;
          return { ...report, version: report.version ?? 1, supersedesId: report.supersedesId ?? null };
        })
        .sort((a, b) => a.stage.localeCompare(b.stage) || a.version - b.version),
      linkedReports,
    };
  }

  /** A condition photo of the disputed booking, for the assigned admin (audited). */
  async evidencePhoto(reviewerUid: string, id: string, mediaId: string, requestId: string | null) {
    const { dispute, booking } = await this.load(id);
    this.assertNoConflict(booking, reviewerUid);
    this.assertAssigned(dispute, reviewerUid);
    const media = (await this.db.collection(COLLECTIONS.media).doc(mediaId).get()).data() as MediaDocument | undefined;
    if (!media || media.purpose !== "condition" || media.bookingId !== booking.id) {
      throw new NotFoundException("Photo not found");
    }
    await this.audit.record({
      actorUid: reviewerUid,
      action: "dispute.read_evidence_photo",
      entityType: "dispute",
      entityId: id,
      requestId,
      summary: { mediaId },
    });
    return media;
  }

  /** POST /admin/disputes/:id/resolve */
  async resolve(
    reviewerUid: string,
    id: string,
    body: ResolveDisputeBody,
    requestId: string | null,
  ): Promise<DisputeDto> {
    const pre = await this.load(id);
    this.assertNoConflict(pre.booking, reviewerUid);

    return this.calendar.withListingCalendar(pre.booking.listingId, async (scope) => {
      const db = scope.db;
      const now = scope.now;
      const dispute = await scope.read<DisputeDoc>(this.ref(id));
      if (!dispute) throw new NotFoundException("Case not found");
      const booking = await scope.readBooking(dispute.bookingId);
      if (!booking) throw new NotFoundException("Case not found");
      scope.claim(booking.id);
      const deposit = await scope.read<DepositDoc>(db.collection(COLLECTIONS.deposits).doc(booking.id));
      const listingRef = db.collection(COLLECTIONS.listings).doc(booking.listingId);
      const listing = await scope.read<ListingDocument>(listingRef);

      this.assertNoConflict(booking, reviewerUid);
      this.assertAssigned(dispute, reviewerUid);
      if (dispute.status === "resolved") throw new ConflictException("This case is already resolved.");
      if (dispute.revision !== body.expectedRevision) {
        throw new ConflictException("This case changed. Refresh to see the latest version.", {
          reason: "stale_revision",
        });
      }

      const held = dispute.kind === "exchange" ? (deposit?.heldHalalas ?? 0) : 0;
      if (body.refundHalalas + body.compensationHalalas !== held) {
        throw new ValidationException(
          [
            {
              field: "compensationHalalas",
              message: `Refund and compensation must add up to the held deposit (${formatSar(held)}).`,
            },
          ],
          "The allocation does not balance",
        );
      }

      const resolved: DisputeDoc = {
        ...dispute,
        status: "resolved",
        resolution: {
          rationale: body.rationale,
          itemOutcome: body.itemOutcome,
          depositAllocation: { refundHalalas: body.refundHalalas, compensationHalalas: body.compensationHalalas },
        },
        resolvedByUid: reviewerUid,
        resolvedAt: now,
        revision: dispute.revision + 1,
        updatedAt: now,
      };
      scope.buffer.set(this.ref(id), resolved);

      // Simulated settlement of the held deposit.
      if (deposit && held > 0) {
        const payment = (operation: "refund" | "compensation", amount: number) => {
          if (amount <= 0) return;
          const pid = ids.payment(booking.id, "deposit", operation);
          const p: PaymentDoc = {
            id: pid,
            bookingId: booking.id,
            component: "deposit",
            operation,
            amountHalalas: amount,
            currency: "SAR",
            status: "succeeded",
            mode: "simulated",
            idempotencyKey: pid,
            createdAt: now,
          };
          scope.buffer.set(db.collection(COLLECTIONS.payments).doc(pid), p);
        };
        payment("refund", body.refundHalalas);
        payment("compensation", body.compensationHalalas);
        const settled: DepositDoc = {
          ...deposit,
          heldHalalas: 0,
          refundedHalalas: deposit.refundedHalalas + body.refundHalalas,
          compensationHalalas: deposit.compensationHalalas + body.compensationHalalas,
          status: "settled",
          revision: deposit.revision + 1,
          updatedAt: now,
        };
        if (!depositInvariantHolds(settled)) throw new Error("Deposit invariant broken by resolution");
        scope.buffer.set(db.collection(COLLECTIONS.deposits).doc(booking.id), settled);
      }

      const writer = new BookingEventWriter(booking, now);
      const outcome = OUTCOME_LABELS[body.itemOutcome];
      const allocation =
        held > 0
          ? ` Deposit: ${formatSar(body.refundHalalas)} refunded, ${formatSar(body.compensationHalalas)} to the owner (simulated).`
          : "";
      let seq: number;
      if (dispute.kind === "exchange" && booking.status === "disputed") {
        // Shown to participants as an admin decision; the admin's identity stays in the audit trail.
        seq = writer.transition("completed", SYSTEM_ACTOR, "dispute_resolved", `Item ${outcome}.${allocation}`);
        writer.set({ completedAt: now });
        scope.releaseReservation(booking.id);
        scope.releaseHold(booking.id);
      } else {
        seq = writer.record("dispute_resolved", SYSTEM_ACTOR, `Complaint reviewed: item ${outcome}.`);
      }

      // Lost or needing repair: the item stays unavailable until the owner republishes it.
      if (body.itemOutcome === "lost" || body.itemOutcome === "needs_repair") {
        scope.setItemHold({ reason: body.itemOutcome, bookingId: booking.id, since: now });
        if (listing && listing.status === "published") {
          scope.buffer.set(
            listingRef,
            { status: "paused", revision: listing.revision + 1, updatedAt: now },
            { merge: true },
          );
        }
      }

      for (const recipient of [booking.ownerUid, booking.borrowerUid]) {
        writer.notify(seq, {
          recipientUid: recipient,
          type: "dispute_resolved",
          title: "Case resolved",
          body: `An admin resolved the case about ${booking.termsSnapshot.titleEn}: item ${outcome}.${allocation}`,
        });
      }
      writer.writeTo(scope.buffer, db);

      this.audit.inBuffer(scope.buffer, db, {
        actorUid: reviewerUid,
        action: "dispute.resolve",
        entityType: "dispute",
        entityId: id,
        requestId,
        reason: body.rationale,
        summary: {
          itemOutcome: body.itemOutcome,
          refundHalalas: body.refundHalalas,
          compensationHalalas: body.compensationHalalas,
        },
      }, now);
      return resolved;
    });
  }
}
