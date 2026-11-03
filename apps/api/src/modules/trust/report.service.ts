/**
 * Reports — content or conduct (a listing, a message, a review or a member).
 *
 * A member can only report something they can see; anything else is 404 so
 * reports cannot be used to probe private data. A report never changes its
 * target. Reviewers assign, read and close reports; a reviewer who is part of
 * the reported matter is refused (conflict of interest). Every reviewer action
 * is audited, including reading a reported private message.
 */

import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { CloseReportBody, CreateReportBody, ReportDto } from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import { ConflictException, NotFoundException, ValidationException } from "../../common/errors/api-exceptions.js";
import type { ListingDocument } from "../listings/listing.repository.js";
import type { MediaDocument } from "../media/media.repository.js";
import type {
  BookingDoc,
  ConversationDoc,
  DisputeDoc,
  MessageDoc,
  NotificationDoc,
  ReportDoc,
} from "../exchange/exchange.types.js";
import { disputeIdFor } from "../exchange/exchange.types.js";
import { WriteBuffer } from "../exchange/write-buffer.js";
import { MemberDirectory } from "../exchange/member-directory.service.js";
import { AuditService } from "../roles/audit.service.js";
import type { ReviewDoc } from "../reviews/review.service.js";

export interface ReportTargetSummary {
  targetType: ReportDto["targetType"];
  title: string;
  /** Members connected to the target; a reviewer among them has a conflict. */
  involvedUids: string[];
  detail: Record<string, string | number | null>;
}

const OUTCOME_LABELS: Record<CloseReportBody["outcome"], string> = {
  no_action: "No action needed",
  content_hidden: "Content hidden",
  member_warned: "Member warned",
  escalated_to_dispute: "Handled in a dispute case",
  other: "Handled",
};

function toDto(doc: ReportDoc): ReportDto {
  const { clientRequestId: _c, ...dto } = doc;
  return dto;
}

@Injectable()
export class ReportService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly members: MemberDirectory,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  private ref(id: string) {
    return this.db.collection(COLLECTIONS.reports).doc(id);
  }

  /**
   * What the target is and who is involved, if `viewerUid` may see it
   * (pass null for a reviewer's case-scoped read). Null when not visible.
   */
  async resolveTarget(
    targetType: ReportDto["targetType"],
    targetId: string,
    viewerUid: string | null,
  ): Promise<ReportTargetSummary | null> {
    const db = this.db;
    if (targetType === "listing") {
      const listing = (await db.collection(COLLECTIONS.listings).doc(targetId).get()).data() as
        | ListingDocument
        | undefined;
      if (!listing) return null;
      if (viewerUid && listing.ownerUid === viewerUid) return null;
      if (viewerUid && listing.status !== "published") {
        const booked = await db
          .collection(COLLECTIONS.bookings)
          .where("listingId", "==", targetId)
          .where("borrowerUid", "==", viewerUid)
          .limit(1)
          .get();
        if (booked.empty) return null;
      }
      return {
        targetType,
        title: listing.titleEn,
        involvedUids: [listing.ownerUid],
        detail: { status: listing.status, ownerUid: listing.ownerUid },
      };
    }
    if (targetType === "message") {
      const message = (await db.collection(COLLECTIONS.messages).doc(targetId).get()).data() as MessageDoc | undefined;
      if (!message) return null;
      const conversation = (await db.collection(COLLECTIONS.conversations).doc(message.conversationId).get()).data() as
        | ConversationDoc
        | undefined;
      if (!conversation) return null;
      if (viewerUid && (!conversation.participantUids.includes(viewerUid) || message.senderUid === viewerUid)) {
        return null;
      }
      return {
        targetType,
        title: "A message",
        involvedUids: conversation.participantUids,
        detail: { senderUid: message.senderUid, conversationId: message.conversationId, sentAt: message.createdAt },
      };
    }
    if (targetType === "review") {
      const review = (await db.collection(COLLECTIONS.reviews).doc(targetId).get()).data() as ReviewDoc | undefined;
      if (!review) return null;
      if (viewerUid && (review.moderationStatus !== "visible" || review.authorUid === viewerUid)) return null;
      return {
        targetType,
        title: `A ${review.rating}-star review`,
        involvedUids: [review.authorUid, review.recipientUid],
        detail: {
          rating: review.rating,
          comment: review.comment,
          authorUid: review.authorUid,
          recipientUid: review.recipientUid,
          moderationStatus: review.moderationStatus,
        },
      };
    }
    const member = (await db.collection(COLLECTIONS.users).doc(targetId).get()).data() as
      | { displayName?: string; completedProfile?: boolean }
      | undefined;
    if (!member || !member.completedProfile || targetId === viewerUid) return null;
    return {
      targetType,
      title: member.displayName ?? "A member",
      involvedUids: [targetId],
      detail: { displayName: member.displayName ?? null },
    };
  }

  /** POST /me/reports — a repeated clientRequestId returns the same report. */
  async create(uid: string, body: CreateReportBody): Promise<ReportDto> {
    const id = `rpt_${createHash("sha256").update(`${uid}\u0000${body.clientRequestId}`).digest("hex").slice(0, 24)}`;
    const existing = (await this.ref(id).get()).data() as ReportDoc | undefined;
    if (existing) return toDto(existing);

    const target = await this.resolveTarget(body.targetType, body.targetId, uid);
    if (!target) throw new NotFoundException("Nothing to report was found");
    if (body.bookingId) {
      const booking = (await this.db.collection(COLLECTIONS.bookings).doc(body.bookingId).get()).data() as
        | BookingDoc
        | undefined;
      if (!booking || (booking.ownerUid !== uid && booking.borrowerUid !== uid)) {
        throw new NotFoundException("Booking not found");
      }
    }

    const doc = await this.db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      const again = await tx.get(this.ref(id));
      if (again.exists) return again.data() as ReportDoc;
      const media: (MediaDocument | null)[] = [];
      for (const mediaId of body.evidenceMediaIds) {
        const snap = await tx.get(this.db.collection(COLLECTIONS.media).doc(mediaId));
        media.push(snap.exists ? (snap.data() as MediaDocument) : null);
      }
      // A report about a booking with an open case joins that case.
      const disputeRef = body.bookingId ? this.db.collection(COLLECTIONS.disputes).doc(disputeIdFor(body.bookingId)) : null;
      const dispute = disputeRef ? ((await tx.get(disputeRef)).data() as DisputeDoc | undefined) : undefined;
      const linkDispute = !!dispute && dispute.status !== "resolved";
      media.forEach((m, i) => {
        if (!m || m.ownerUid !== uid || m.purpose !== "report" || m.parentId || m.uploadState !== "pending") {
          throw new ValidationException([
            { field: `evidenceMediaIds.${i}`, message: "Each photo must be your own new report photo upload." },
          ]);
        }
      });
      const report: ReportDoc = {
        id,
        reporterUid: uid,
        targetType: body.targetType,
        targetId: body.targetId,
        bookingId: body.bookingId ?? null,
        category: body.category,
        description: body.description,
        evidenceMediaIds: body.evidenceMediaIds,
        status: "open",
        outcome: null,
        outcomeNote: null,
        assignedReviewerUid: null,
        disputeId: linkDispute ? dispute!.id : null,
        createdAt: now,
        updatedAt: now,
        clientRequestId: body.clientRequestId,
      };
      const buffer = new WriteBuffer();
      buffer.set(this.ref(id), report);
      if (linkDispute && disputeRef) {
        buffer.set(disputeRef, {
          ...dispute!,
          linkedReportIds: [...dispute!.linkedReportIds, id],
          revision: dispute!.revision + 1,
          updatedAt: now,
        });
      }
      for (const mediaId of body.evidenceMediaIds) {
        buffer.set(
          this.db.collection(COLLECTIONS.media).doc(mediaId),
          { uploadState: "attached", parentType: "report", parentId: id, expiresAt: null },
          { merge: true },
        );
      }
      buffer.flush(tx);
      return report;
    });
    return toDto(doc);
  }

  async listMine(uid: string): Promise<ReportDto[]> {
    const snap = await this.db.collection(COLLECTIONS.reports).where("reporterUid", "==", uid).get();
    return snap.docs
      .map((d) => toDto(d.data() as ReportDoc))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  // ─── Reviewer actions ───

  async get(id: string): Promise<ReportDoc> {
    const doc = (await this.ref(id).get()).data() as ReportDoc | undefined;
    if (!doc) throw new NotFoundException("Report not found");
    return doc;
  }

  /** Reporter or anyone involved in the target cannot handle the report. */
  async isConflicted(reviewerUid: string, report: ReportDoc): Promise<boolean> {
    if (report.reporterUid === reviewerUid) return true;
    const target = await this.resolveTarget(report.targetType, report.targetId, null);
    return !!target?.involvedUids.includes(reviewerUid);
  }

  async queue(reviewerUid: string) {
    const [open, inReview] = await Promise.all(
      (["open", "in_review"] as const).map((status) =>
        this.db.collection(COLLECTIONS.reports).where("status", "==", status).get(),
      ),
    );
    const docs = [...open!.docs, ...inReview!.docs]
      .map((d) => d.data() as ReportDoc)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return Promise.all(
      docs.map(async (r) => ({
        id: r.id,
        targetType: r.targetType,
        category: r.category,
        status: r.status,
        createdAt: r.createdAt,
        assignedReviewerUid: r.assignedReviewerUid,
        assignedToMe: r.assignedReviewerUid === reviewerUid,
        conflict: await this.isConflicted(reviewerUid, r),
      })),
    );
  }

  async assign(reviewerUid: string, id: string, requestId: string | null): Promise<ReportDto> {
    const before = await this.get(id);
    if (await this.isConflicted(reviewerUid, before)) {
      throw new ConflictException(
        "You are involved in this report, so another reviewer must handle it. It stays in the queue.",
        { reason: "conflict_of_interest" },
      );
    }
    const doc = await this.db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      const report = (await tx.get(this.ref(id))).data() as ReportDoc;
      if (report.status === "closed") throw new ConflictException("This report is already closed.");
      if (report.assignedReviewerUid && report.assignedReviewerUid !== reviewerUid) {
        throw new ConflictException("Another reviewer is already handling this report.");
      }
      const updated: ReportDoc = { ...report, status: "in_review", assignedReviewerUid: reviewerUid, updatedAt: now };
      const buffer = new WriteBuffer();
      buffer.set(this.ref(id), updated);
      this.audit.inBuffer(buffer, this.db, {
        actorUid: reviewerUid,
        action: "report.assign",
        entityType: "report",
        entityId: id,
        requestId,
      }, now);
      buffer.flush(tx);
      return updated;
    });
    return toDto(doc);
  }

  private assertAssigned(report: ReportDoc, reviewerUid: string): void {
    if (report.assignedReviewerUid !== reviewerUid) {
      throw new ConflictException("Assign this report to yourself before working on it.", {
        reason: "not_assigned",
      });
    }
  }

  /** Case-scoped view for the assigned reviewer; reading a private message is audited. */
  async detailForReviewer(reviewerUid: string, id: string, requestId: string | null) {
    const report = await this.get(id);
    this.assertAssigned(report, reviewerUid);
    const target = await this.resolveTarget(report.targetType, report.targetId, null);
    let messageBody: string | null = null;
    if (report.targetType === "message") {
      const message = (await this.db.collection(COLLECTIONS.messages).doc(report.targetId).get()).data() as
        | MessageDoc
        | undefined;
      messageBody = message?.body ?? null;
    }
    await this.audit.record({
      actorUid: reviewerUid,
      action: report.targetType === "message" ? "report.read_private_message" : "report.read",
      entityType: "report",
      entityId: id,
      requestId,
    });
    const names = await this.members.displayNames([report.reporterUid, ...(target?.involvedUids ?? [])]);
    return {
      report: toDto(report),
      reporterName: names.get(report.reporterUid) ?? "Member",
      target: target
        ? {
            ...target,
            involved: target.involvedUids.map((u) => ({ uid: u, displayName: names.get(u) ?? "Member" })),
            messageBody,
          }
        : null,
    };
  }

  async close(reviewerUid: string, id: string, body: CloseReportBody, requestId: string | null): Promise<ReportDto> {
    const doc = await this.db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      const report = (await tx.get(this.ref(id))).data() as ReportDoc | undefined;
      if (!report) throw new NotFoundException("Report not found");
      this.assertAssigned(report, reviewerUid);
      if (report.status === "closed") return report;
      const updated: ReportDoc = {
        ...report,
        status: "closed",
        outcome: body.outcome,
        outcomeNote: body.note,
        updatedAt: now,
      };
      const notification: NotificationDoc = {
        id: `ntf_rpt_${id}_closed`,
        recipientUid: report.reporterUid,
        type: "report_closed",
        entityType: "report",
        entityId: id,
        title: "Your report was reviewed",
        body: `Outcome: ${OUTCOME_LABELS[body.outcome]}. Thank you for helping keep the neighborhood safe.`,
        actionPath: "/reports",
        createdAt: now,
        readAt: null,
      };
      const buffer = new WriteBuffer();
      buffer.set(this.ref(id), updated);
      buffer.set(this.db.collection(COLLECTIONS.notifications).doc(notification.id), notification);
      this.audit.inBuffer(buffer, this.db, {
        actorUid: reviewerUid,
        action: "report.close",
        entityType: "report",
        entityId: id,
        requestId,
        reason: body.note,
        summary: { outcome: body.outcome },
      }, now);
      buffer.flush(tx);
      return updated;
    });
    return toDto(doc);
  }

  /** Evidence photo of a report, for its assigned reviewer (audited). */
  async evidencePhoto(reviewerUid: string, id: string, mediaId: string, requestId: string | null) {
    const report = await this.get(id);
    this.assertAssigned(report, reviewerUid);
    if (!report.evidenceMediaIds.includes(mediaId)) throw new NotFoundException("Photo not found");
    const media = (await this.db.collection(COLLECTIONS.media).doc(mediaId).get()).data() as MediaDocument | undefined;
    if (!media || media.purpose !== "report" || media.parentId !== id) throw new NotFoundException("Photo not found");
    await this.audit.record({
      actorUid: reviewerUid,
      action: "report.read_evidence_photo",
      entityType: "report",
      entityId: id,
      requestId,
      summary: { mediaId },
    });
    return media;
  }
}
