/**
 * Moderation decisions on reports (D-42).
 *
 * The assigned admin judges the report and picks one decision:
 *   invalid   - close with a note to the reporter; nothing else changes
 *   warn      - low severity: the reported member is told what to fix
 *   take_down - medium: the listing is removed (archived, admin restore only),
 *               or the message or review is hidden
 *   suspend   - high: the member cannot sign in or use the API, their
 *               published listings are paused and their upcoming bookings
 *               are cancelled (simulated payments refunded)
 *
 * Effects run first and are safe to repeat; the report is closed last, so a
 * failure part way leaves the report open for the admin to try again.
 * Bookings already handed over stay open; the other member can report an
 * issue and an admin settles it. Admins can restore a removed listing and
 * lift a suspension. Every step is audited.
 */

import { Injectable, Logger } from "@nestjs/common";
import {
  DECISION_SEVERITY,
  decisionsFor,
  dueSystemTransition,
  type DecideReportBody,
  type ModerationOverviewDto,
  type ReportDecision,
  type ReportDto,
} from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import { ConflictException, NotFoundException, ValidationException } from "../../common/errors/api-exceptions.js";
import { forgetAccountStatus } from "../../common/guards/account-status.js";
import type { ListingDocument } from "../listings/listing.repository.js";
import type { ReviewDoc } from "../reviews/review.service.js";
import {
  CalendarGuardService,
  applySystemTransition,
  type CalendarScope,
} from "../exchange/calendar-guard.service.js";
import { BookingEventWriter } from "../exchange/booking-event-writer.js";
import type { BookingDoc, ConversationDoc, MessageDoc, NotificationDoc, ReportDoc } from "../exchange/exchange.types.js";
import { SYSTEM_ACTOR } from "../exchange/exchange.types.js";
import { WriteBuffer } from "../exchange/write-buffer.js";
import { MemberDirectory } from "../exchange/member-directory.service.js";
import { readDeposit, recordSimulatedPayment, refundHeldDeposit } from "../bookings/booking.service.js";
import { AuditService } from "../roles/audit.service.js";
import { RolesService } from "../roles/roles.service.js";
import { OUTCOME_LABELS, ReportService, toDto, type ReportTargetSummary } from "./report.service.js";

const OPEN_STATUSES = new Set(["pending", "accepted", "confirmed"]);
const REMOVED_PREVIEW = "Message removed by an admin";

interface SuspensionRecord {
  at: string;
  byUid: string;
  reason: string;
  reportId: string | null;
}

type MemberDoc = {
  displayName?: string;
  accountStatus?: "active" | "suspended";
  suspension?: SuspensionRecord | null;
};

function outcomeFor(decision: ReportDecision, targetType: ReportDto["targetType"]): string {
  if (decision === "invalid") return "no_action";
  if (decision === "warn") return "member_warned";
  if (decision === "suspend") return "member_suspended";
  return targetType === "listing" ? "listing_removed" : "content_hidden";
}

const THING: Record<ReportDto["targetType"], string> = {
  listing: "your listing",
  message: "a message you sent",
  review: "a review you wrote",
  member: "your conduct",
};

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly calendar: CalendarGuardService,
    private readonly members: MemberDirectory,
    private readonly audit: AuditService,
    private readonly roles: RolesService,
    private readonly reports: ReportService,
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  // ─── Decide ───

  async decide(reviewerUid: string, reportId: string, body: DecideReportBody, requestId: string | null): Promise<ReportDto> {
    const report = await this.reports.get(reportId);
    this.reports.assertAssigned(report, reviewerUid);
    if (report.status === "closed") {
      if (report.decision === body.decision) return toDto(report);
      throw new ConflictException("This report is already closed.");
    }

    const target = await this.reports.resolveTarget(report.targetType, report.targetId, null);
    if (body.decision !== "invalid") {
      if (!target) {
        throw new ConflictException("The reported item no longer exists. Close the report as invalid instead.", {
          reason: "target_missing",
        });
      }
      if (!decisionsFor(report.targetType).includes(body.decision)) {
        throw new ValidationException([{ field: "decision", message: "A member report has nothing to take down." }]);
      }
    }
    const subjectUid = target?.responsibleUid ?? null;
    if (subjectUid === reviewerUid) {
      throw new ConflictException("You are involved in this report, so another admin must handle it.", {
        reason: "conflict_of_interest",
      });
    }

    if (body.decision === "suspend") {
      const roles = await this.roles.rolesOf(subjectUid!);
      if (roles.includes("admin")) {
        throw new ConflictException(
          "This member is an admin. Remove the admin role (scripts/grant-role.mjs --revoke) before suspending the account.",
          { reason: "privileged_member" },
        );
      }
      await this.suspendMember(subjectUid!, reviewerUid, body.note, reportId, requestId);
    } else if (body.decision === "take_down") {
      await this.takeDown(report, target!, reviewerUid, body.note, requestId);
    }

    return this.closeWithDecision(reviewerUid, reportId, body, target, requestId);
  }

  private async closeWithDecision(
    reviewerUid: string,
    reportId: string,
    body: DecideReportBody,
    target: ReportTargetSummary | null,
    requestId: string | null,
  ): Promise<ReportDto> {
    const ref = this.db.collection(COLLECTIONS.reports).doc(reportId);
    const doc = await this.db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      const report = (await tx.get(ref)).data() as ReportDoc | undefined;
      if (!report) throw new NotFoundException("Report not found");
      this.reports.assertAssigned(report, reviewerUid);
      if (report.status === "closed") return report;

      const outcome = outcomeFor(body.decision, report.targetType);
      const subjectUid = body.decision === "invalid" ? null : target!.responsibleUid;
      const updated: ReportDoc = {
        ...report,
        status: "closed",
        outcome,
        outcomeNote: body.note,
        decision: body.decision,
        severity: DECISION_SEVERITY[body.decision],
        subjectUid,
        decidedAt: now,
        updatedAt: now,
      };
      const buffer = new WriteBuffer();
      buffer.set(ref, updated);

      const reporterNote: NotificationDoc = {
        id: `ntf_rpt_${reportId}_closed`,
        recipientUid: report.reporterUid,
        type: "report_closed",
        entityType: "report",
        entityId: reportId,
        title: "Your report was reviewed",
        body:
          body.decision === "invalid"
            ? `An admin found nothing that needs action. Admin's note: ${body.note}`
            : `Outcome: ${OUTCOME_LABELS[outcome]}. Thank you for helping keep the neighborhood safe.`,
        actionPath: "/reports",
        createdAt: now,
        readAt: null,
      };
      buffer.set(this.db.collection(COLLECTIONS.notifications).doc(reporterNote.id), reporterNote);

      if (subjectUid) {
        const subjectNote = this.subjectNotification(report, target!, body, subjectUid, now);
        buffer.set(this.db.collection(COLLECTIONS.notifications).doc(subjectNote.id), subjectNote);
      }

      this.audit.inBuffer(buffer, this.db, {
        actorUid: reviewerUid,
        action: "report.decide",
        entityType: "report",
        entityId: reportId,
        requestId,
        reason: body.note,
        summary: { decision: body.decision, severity: DECISION_SEVERITY[body.decision], outcome },
      }, now);
      buffer.flush(tx);
      return updated;
    });
    return toDto(doc);
  }

  private subjectNotification(
    report: ReportDoc,
    target: ReportTargetSummary,
    body: DecideReportBody,
    subjectUid: string,
    now: string,
  ): NotificationDoc {
    const isListing = report.targetType === "listing";
    const base = {
      id: `ntf_rpt_${report.id}_subject`,
      recipientUid: subjectUid,
      createdAt: now,
      readAt: null,
    };
    if (body.decision === "warn") {
      return {
        ...base,
        type: "moderation_warning",
        entityType: isListing ? "listing" : "report",
        entityId: isListing ? report.targetId : report.id,
        title: isListing ? "Your listing was reported" : "An admin sent you a warning",
        body: isListing
          ? `An admin checked a report about "${target.title}" and asks you to fix it: ${body.note}`
          : `An admin checked a report about ${THING[report.targetType]}: ${body.note}`,
        actionPath: isListing ? `/listings/${report.targetId}/edit` : "/notifications",
      };
    }
    if (body.decision === "take_down") {
      return {
        ...base,
        type: "content_removed",
        entityType: isListing ? "listing" : "report",
        entityId: isListing ? report.targetId : report.id,
        title: isListing
          ? "Your listing was removed"
          : report.targetType === "message"
            ? "A message you sent was removed"
            : "A review you wrote was hidden",
        body: isListing
          ? `An admin removed "${target.title}" after a report: ${body.note} Its upcoming bookings were cancelled.`
          : `An admin acted on a report about ${THING[report.targetType]}: ${body.note}`,
        actionPath: isListing ? "/my-listings" : "/notifications",
      };
    }
    return {
      ...base,
      type: "account_suspended",
      entityType: "report",
      entityId: report.id,
      title: "Your account was suspended",
      body: `An admin suspended your account after a report: ${body.note}`,
      actionPath: "/notifications",
    };
  }

  // ─── Take down ───

  private async takeDown(
    report: ReportDoc,
    target: ReportTargetSummary,
    reviewerUid: string,
    reason: string,
    requestId: string | null,
  ): Promise<void> {
    if (report.targetType === "listing") {
      await this.removeListing(report.targetId, reviewerUid, reason, report.id, requestId);
    } else if (report.targetType === "message") {
      await this.hideMessage(report.targetId, reviewerUid, reason, report.id, requestId);
    } else if (report.targetType === "review") {
      await this.hideReview(report.targetId, reviewerUid, reason, report.id, requestId);
    }
    void target;
  }

  /** Archive the listing as removed and cancel its upcoming bookings, in one calendar transaction. */
  async removeListing(listingId: string, actorUid: string, reason: string, reportId: string | null, requestId: string | null) {
    const listingRef = this.db.collection(COLLECTIONS.listings).doc(listingId);
    let cancelled = 0;
    await this.calendar.withListingCalendar(listingId, async (scope) => {
      const listing = await scope.read<ListingDocument>(listingRef);
      if (!listing) throw new NotFoundException("Listing not found");
      cancelled = await this.cancelOpenBookings(scope, () => true, "listing_removed");
      if (listing.moderationStatus === "removed") return;
      const updated: ListingDocument = {
        ...listing,
        status: "archived",
        moderationStatus: "removed",
        moderationReason: reason,
        moderationReportId: reportId,
        moderatedAt: scope.now,
        suspensionHold: false,
        revision: listing.revision + 1,
        updatedAt: scope.now,
      };
      scope.buffer.set(listingRef, updated);
      this.audit.inBuffer(scope.buffer, this.db, {
        actorUid,
        action: "listing.remove",
        entityType: "listing",
        entityId: listingId,
        requestId,
        reason,
        summary: { reportId, previousStatus: listing.status },
      }, scope.now);
    });
    return { cancelledBookings: cancelled };
  }

  private async hideMessage(messageId: string, actorUid: string, reason: string, reportId: string, requestId: string | null) {
    const ref = this.db.collection(COLLECTIONS.messages).doc(messageId);
    await this.db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      const message = (await tx.get(ref)).data() as MessageDoc | undefined;
      if (!message) throw new NotFoundException("Message not found");
      if (message.moderationStatus === "removed") return;
      const convRef = this.db.collection(COLLECTIONS.conversations).doc(message.conversationId);
      const conversation = (await tx.get(convRef)).data() as ConversationDoc | undefined;
      const buffer = new WriteBuffer();
      buffer.set(ref, { moderationStatus: "removed", moderatedAt: now }, { merge: true });
      if (conversation && conversation.lastMessageId === messageId) {
        buffer.set(convRef, { lastMessagePreview: REMOVED_PREVIEW }, { merge: true });
      }
      this.audit.inBuffer(buffer, this.db, {
        actorUid,
        action: "message.remove",
        entityType: "message",
        entityId: messageId,
        requestId,
        reason,
        summary: { reportId },
      }, now);
      buffer.flush(tx);
    });
  }

  private async hideReview(reviewId: string, actorUid: string, reason: string, reportId: string, requestId: string | null) {
    const ref = this.db.collection(COLLECTIONS.reviews).doc(reviewId);
    await this.db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      const review = (await tx.get(ref)).data() as ReviewDoc | undefined;
      if (!review) throw new NotFoundException("Review not found");
      if (review.moderationStatus === "hidden") return;
      const buffer = new WriteBuffer();
      buffer.set(ref, { ...review, moderationStatus: "hidden", hiddenReason: reason, hiddenByUid: actorUid, hiddenAt: now });
      this.audit.inBuffer(buffer, this.db, {
        actorUid,
        action: "review.hide",
        entityType: "review",
        entityId: reviewId,
        requestId,
        reason,
        summary: { reportId },
      }, now);
      buffer.flush(tx);
    });
  }

  // ─── Suspend and reinstate ───

  async suspendMember(uid: string, actorUid: string, reason: string, reportId: string | null, requestId: string | null) {
    const userRef = this.db.collection(COLLECTIONS.users).doc(uid);
    await this.db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      const member = (await tx.get(userRef)).data() as MemberDoc | undefined;
      if (!member) throw new NotFoundException("Member not found");
      if (member.accountStatus === "suspended") return;
      const buffer = new WriteBuffer();
      const suspension: SuspensionRecord = { at: now, byUid: actorUid, reason, reportId };
      buffer.set(userRef, { accountStatus: "suspended", suspension, updatedAt: now }, { merge: true });
      this.audit.inBuffer(buffer, this.db, {
        actorUid,
        action: "member.suspend",
        entityType: "member",
        entityId: uid,
        requestId,
        reason,
        summary: { reportId },
      }, now);
      buffer.flush(tx);
    });
    forgetAccountStatus(uid);

    // Sign-in: disable the account and end its sessions (outside any transaction).
    try {
      await this.firebase.auth.updateUser(uid, { disabled: true });
      await this.firebase.auth.revokeRefreshTokens(uid);
    } catch (err) {
      // The API still refuses the member through accountStatus.
      this.logger.warn(`Could not disable sign-in for a suspended member: ${(err as Error).message}`);
    }

    // Listings and bookings, one calendar transaction per listing.
    const [owned, asOwner, asBorrower] = await Promise.all([
      this.db.collection(COLLECTIONS.listings).where("ownerUid", "==", uid).get(),
      this.db.collection(COLLECTIONS.bookings).where("ownerUid", "==", uid).get(),
      this.db.collection(COLLECTIONS.bookings).where("borrowerUid", "==", uid).get(),
    ]);
    const listingIds = new Set<string>();
    for (const d of owned.docs) {
      if ((d.data() as ListingDocument).status === "published") listingIds.add(d.id);
    }
    for (const d of [...asOwner.docs, ...asBorrower.docs]) {
      const b = d.data() as BookingDoc;
      if (OPEN_STATUSES.has(b.status)) listingIds.add(b.listingId);
    }
    for (const listingId of listingIds) {
      await this.calendar.withListingCalendar(listingId, async (scope) => {
        const listingRef = this.db.collection(COLLECTIONS.listings).doc(listingId);
        const listing = await scope.read<ListingDocument>(listingRef);
        await this.cancelOpenBookings(scope, (b) => b.ownerUid === uid || b.borrowerUid === uid, "member_suspended");
        if (listing && listing.ownerUid === uid && listing.status === "published") {
          scope.buffer.set(listingRef, {
            ...listing,
            status: "paused",
            suspensionHold: true,
            revision: listing.revision + 1,
            updatedAt: scope.now,
          });
        }
      });
    }
  }

  async reinstateMember(adminUid: string, uid: string, reason: string, requestId: string | null) {
    const userRef = this.db.collection(COLLECTIONS.users).doc(uid);
    const changed = await this.db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      const member = (await tx.get(userRef)).data() as MemberDoc | undefined;
      if (!member) throw new NotFoundException("Member not found");
      if (member.accountStatus !== "suspended") return false;
      const reportId = member.suspension?.reportId ?? null;
      const buffer = new WriteBuffer();
      buffer.set(userRef, { accountStatus: "active", suspension: null, updatedAt: now }, { merge: true });
      const notice: NotificationDoc = {
        id: `ntf_reinstated_${uid}_${now.replace(/[^0-9]/g, "")}`,
        recipientUid: uid,
        type: "account_reinstated",
        entityType: reportId ? "report" : "account",
        entityId: reportId ?? uid,
        title: "Your account is active again",
        body: `An admin lifted the suspension on your account. Listings paused by the suspension are published again. ${reason}`,
        actionPath: "/my-listings",
        createdAt: now,
        readAt: null,
      };
      buffer.set(this.db.collection(COLLECTIONS.notifications).doc(notice.id), notice);
      this.audit.inBuffer(buffer, this.db, {
        actorUid: adminUid,
        action: "member.reinstate",
        entityType: "member",
        entityId: uid,
        requestId,
        reason,
      }, now);
      buffer.flush(tx);
      return true;
    });
    forgetAccountStatus(uid);
    try {
      await this.firebase.auth.updateUser(uid, { disabled: false });
    } catch (err) {
      this.logger.warn(`Could not re-enable sign-in for a member: ${(err as Error).message}`);
    }

    const held = await this.db.collection(COLLECTIONS.listings).where("ownerUid", "==", uid).get();
    let republished = 0;
    for (const d of held.docs) {
      if (!(d.data() as ListingDocument).suspensionHold) continue;
      await this.db.runTransaction(async (tx) => {
        const now = new Date().toISOString();
        const listing = (await tx.get(d.ref)).data() as ListingDocument | undefined;
        if (!listing?.suspensionHold) return;
        const publish = listing.status === "paused" && listing.moderationStatus !== "removed";
        tx.set(d.ref, {
          ...listing,
          status: publish ? "published" : listing.status,
          suspensionHold: false,
          revision: listing.revision + 1,
          updatedAt: now,
        });
        if (publish) republished++;
      });
    }
    return { reinstated: changed, republishedListings: republished };
  }

  // ─── Admin restore and overview ───

  async restoreListing(adminUid: string, listingId: string, reason: string, requestId: string | null) {
    const ref = this.db.collection(COLLECTIONS.listings).doc(listingId);
    return this.db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      const listing = (await tx.get(ref)).data() as ListingDocument | undefined;
      if (!listing) throw new NotFoundException("Listing not found");
      if (listing.moderationStatus !== "removed") {
        throw new ConflictException("This listing was not removed by an admin.", { reason: "not_removed" });
      }
      const updated: ListingDocument = {
        ...listing,
        status: "paused",
        moderationStatus: null,
        moderationReason: null,
        moderationReportId: null,
        moderatedAt: null,
        revision: listing.revision + 1,
        updatedAt: now,
      };
      const notice: NotificationDoc = {
        id: `ntf_restored_${listingId}_${now.replace(/[^0-9]/g, "")}`,
        recipientUid: listing.ownerUid,
        type: "listing_restored",
        entityType: "listing",
        entityId: listingId,
        title: "Your listing was restored",
        body: `An admin restored "${listing.titleEn}". It is paused; publish it again when it is ready. ${reason}`,
        actionPath: "/my-listings",
        createdAt: now,
        readAt: null,
      };
      const buffer = new WriteBuffer();
      buffer.set(ref, updated);
      buffer.set(this.db.collection(COLLECTIONS.notifications).doc(notice.id), notice);
      this.audit.inBuffer(buffer, this.db, {
        actorUid: adminUid,
        action: "listing.restore",
        entityType: "listing",
        entityId: listingId,
        requestId,
        reason,
      }, now);
      buffer.flush(tx);
      return { id: listingId, status: updated.status };
    });
  }

  async overview(): Promise<ModerationOverviewDto> {
    const [suspended, removed] = await Promise.all([
      this.db.collection(COLLECTIONS.users).where("accountStatus", "==", "suspended").get(),
      this.db.collection(COLLECTIONS.listings).where("moderationStatus", "==", "removed").get(),
    ]);
    const listings = removed.docs.map((d) => d.data() as ListingDocument);
    const names = await this.members.displayNames(listings.map((l) => l.ownerUid));
    return {
      suspendedMembers: suspended.docs
        .map((d) => {
          const m = d.data() as MemberDoc;
          return {
            uid: d.id,
            displayName: m.displayName ?? "Member",
            suspendedAt: m.suspension?.at ?? null,
            reason: m.suspension?.reason ?? null,
            reportId: m.suspension?.reportId ?? null,
          };
        })
        .sort((a, b) => (b.suspendedAt ?? "").localeCompare(a.suspendedAt ?? "")),
      removedListings: listings
        .map((l) => ({
          id: l.id,
          titleEn: l.titleEn,
          ownerUid: l.ownerUid,
          ownerName: names.get(l.ownerUid) ?? "Member",
          removedAt: l.moderatedAt ?? null,
          reason: l.moderationReason ?? null,
          reportId: l.moderationReportId ?? null,
        }))
        .sort((a, b) => (b.removedAt ?? "").localeCompare(a.removedAt ?? "")),
    };
  }

  // ─── Booking cancellation inside a calendar transaction ───

  /**
   * Cancels this listing's pending, accepted and confirmed bookings that match,
   * applying any due expiry first. Confirmed bookings get their simulated
   * payments refunded. Both participants are told.
   */
  private async cancelOpenBookings(
    scope: CalendarScope,
    match: (b: BookingDoc) => boolean,
    why: "listing_removed" | "member_suspended",
  ): Promise<number> {
    const snap = await scope.tx.get(
      this.db.collection(COLLECTIONS.bookings).where("listingId", "==", scope.listingId),
    );
    const candidates = snap.docs
      .map((d) => d.data() as BookingDoc)
      .filter((b) => OPEN_STATUSES.has(b.status) && match(b));
    let cancelled = 0;
    for (const candidate of candidates) {
      const booking = await scope.readBooking(candidate.id);
      if (!booking) continue;
      const writer = new BookingEventWriter(booking, scope.now);
      const due = scope.claim(booking.id) ?? dueSystemTransition(booking, scope.now);
      if (due) applySystemTransition(scope, writer, due);
      const before = writer.booking.status;
      if (OPEN_STATUSES.has(before)) {
        const deposit = before === "confirmed" ? await readDeposit(scope, booking.id) : null;
        const note =
          why === "listing_removed"
            ? "An admin removed this listing, so the booking was cancelled."
            : "An admin suspended a member of this booking, so it was cancelled.";
        const seq = writer.transition("cancelled", SYSTEM_ACTOR, "cancelled_by_moderation", note);
        writer.set({ cancelledAt: scope.now, cancelledByUid: SYSTEM_ACTOR, expiresAt: null });
        if (before === "accepted" || before === "confirmed") scope.releaseReservation(booking.id);
        let refunded = false;
        if (before === "confirmed") {
          recordSimulatedPayment(scope, booking.id, "rental", "refund", booking.termsSnapshot.rentalFeeHalalas);
          refundHeldDeposit(scope, booking.id, deposit);
          refunded = booking.termsSnapshot.totalHalalas > 0;
        }
        for (const recipientUid of [booking.borrowerUid, booking.ownerUid]) {
          writer.notify(seq, {
            recipientUid,
            type: "booking_cancelled",
            title: "Booking cancelled",
            body: `The booking for ${booking.termsSnapshot.titleEn} was cancelled. ${note}${
              refunded ? " Simulated payments were refunded." : ""
            }`,
          });
        }
        cancelled++;
      }
      writer.writeTo(scope.buffer, scope.db);
    }
    return cancelled;
  }
}
