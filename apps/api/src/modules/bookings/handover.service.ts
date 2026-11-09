/**
 * Handover service — collection, return and closure of a confirmed booking.
 *
 * - Pickup and return arrangements are private to the two participants. A
 *   change creates a new revision that the other member acknowledges.
 * - Condition records (collection by the owner, return by the borrower) are
 *   immutable once submitted; photos are private `condition` media.
 * - The borrower's acknowledgement of the collection record activates the
 *   booking; a disagreement is recorded and does not.
 * - Return report → return_pending (item on hold); owner receipt → completed,
 *   reservation released, hold cleared, simulated deposit refunded.
 * - Report issue → disputed, item on hold, deposit under review (resolution
 *   is Sprint 3).
 */

import { Injectable } from "@nestjs/common";
import {
  TRUST_CONFIG,
  addDays,
  normalizeIso,
  toMillis,
  type DisputeIssue,
  type OpenDisputeBody,
  type AcknowledgeArrangementBody,
  type ArrangementBody,
  type ArrangementDto,
  type ArrangementKind,
  type ConditionAcknowledgeBody,
  type ConditionReportBody,
  type ConditionStage,
  type ReportIssueBody,
} from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ValidationException,
} from "../../common/errors/api-exceptions.js";
import { formatRiyadh } from "../../common/format.js";
import type { MediaDocument } from "../media/media.repository.js";
import { decodeImageBytes } from "../media/base64-helpers.js";
import type { CalendarScope } from "../exchange/calendar-guard.service.js";
import type {
  BookingDoc,
  BookingPrivateDetailsDoc,
  ConditionReportDoc,
  DisputeDoc,
} from "../exchange/exchange.types.js";
import { disputeIdFor } from "../exchange/exchange.types.js";
import { BookingEventWriter } from "../exchange/booking-event-writer.js";
import { WriteBuffer } from "../exchange/write-buffer.js";
import { BookingCommandRunner } from "./booking-command-runner.js";
import { latestByStage, versionId, withVersion } from "./condition-versions.js";
import { readDeposit, refundHeldDeposit } from "./booking.service.js";

const KIND_LABEL: Record<ArrangementKind, string> = { pickup: "pickup", return: "return" };

export const ISSUE_LABELS: Record<DisputeIssue, string> = {
  damage: "Damage",
  missing_accessory: "Missing accessory",
  not_returned: "Not returned",
  late_return: "Late return",
  conduct: "Conduct",
  other: "Other issue",
};

function disputeRef(scope: CalendarScope, bookingId: string) {
  return scope.db.collection(COLLECTIONS.disputes).doc(disputeIdFor(bookingId));
}

/** Ids of every condition record (all versions) of a booking, read in the transaction. */
async function conditionReportIds(scope: CalendarScope, bookingId: string): Promise<string[]> {
  const snap = await scope.tx.get(
    scope.db.collection(COLLECTIONS.conditionReports).where("bookingId", "==", bookingId),
  );
  return snap.docs.map((d) => d.id).sort();
}

export function newDisputeDoc(input: {
  id: string;
  bookingId: string;
  kind: "exchange" | "complaint";
  openedByUid: string;
  issue: DisputeIssue;
  description: string;
  linkedConditionReportIds: string[];
  heldDepositHalalas: number;
  now: string;
}): DisputeDoc {
  return {
    id: input.id,
    bookingId: input.bookingId,
    kind: input.kind,
    openedByUid: input.openedByUid,
    issue: input.issue,
    description: input.description,
    linkedConditionReportIds: input.linkedConditionReportIds,
    linkedReportIds: [],
    statements: [],
    status: "open",
    assignedReviewerUid: null,
    resolution: null,
    resolvedByUid: null,
    resolvedAt: null,
    heldDepositHalalas: input.heldDepositHalalas,
    revision: 0,
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function privateDetailsRef(scope: CalendarScope, bookingId: string) {
  return scope.db.collection(COLLECTIONS.bookingPrivateDetails).doc(bookingId);
}


@Injectable()
export class HandoverService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly runner: BookingCommandRunner,
  ) {}

  // ─── Arrangements ───

  async saveArrangement(
    uid: string,
    bookingId: string,
    kind: ArrangementKind,
    body: ArrangementBody,
  ): Promise<ArrangementDto> {
    const { result } = await this.runner.run(bookingId, uid, {
      command: kind === "pickup" ? "arrange_pickup" : "arrange_return",
      prepare: (scope, b) => scope.read<BookingPrivateDetailsDoc>(privateDetailsRef(scope, b.id)),
      apply: ({ scope, writer, booking, actorUid, actorName, otherUid, now }, details) => {
        const current = details?.[kind] ?? null;
        if ((current?.revision ?? 0) !== body.expectedArrangementRevision) {
          throw new ConflictException(
            `The ${KIND_LABEL[kind]} arrangement was changed by the other member. Review the latest version.`,
            { reason: "stale_arrangement" },
          );
        }
        const arrangement: ArrangementDto = {
          kind,
          method: body.method,
          agreedAt: normalizeIso(body.agreedAt),
          locationText: body.locationText,
          ...(body.instructions ? { instructions: body.instructions } : {}),
          revision: (current?.revision ?? 0) + 1,
          proposedByUid: actorUid,
          proposedAt: now,
          acknowledgedByUid: null,
          acknowledgedAt: null,
        };
        // Whole-document write: a merge would keep stale nested fields.
        const nextDetails: BookingPrivateDetailsDoc = {
          bookingId: booking.id,
          participantUids: [booking.ownerUid, booking.borrowerUid],
          pickup: details?.pickup ?? null,
          return: details?.return ?? null,
          updatedAt: now,
        };
        nextDetails[kind] = arrangement;
        scope.buffer.set(privateDetailsRef(scope, booking.id), nextDetails);
        const seq = writer.record(
          `${kind}_arrangement_proposed`,
          actorUid,
          `${KIND_LABEL[kind][0]!.toUpperCase()}${KIND_LABEL[kind].slice(1)} arrangement proposed (version ${arrangement.revision}).`,
        );
        writer.notify(seq, {
          recipientUid: otherUid,
          type: "arrangement_proposed",
          title: `${KIND_LABEL[kind] === "pickup" ? "Pickup" : "Return"} arrangement proposed`,
          body: `${actorName} proposed a ${KIND_LABEL[kind]} time and place for ${booking.termsSnapshot.titleEn}. Review and acknowledge it.`,
        });
        return arrangement;
      },
    });
    return result;
  }

  async acknowledgeArrangement(
    uid: string,
    bookingId: string,
    kind: ArrangementKind,
    body: AcknowledgeArrangementBody,
  ): Promise<ArrangementDto> {
    const { result } = await this.runner.run(bookingId, uid, {
      command: kind === "pickup" ? "arrange_pickup" : "arrange_return",
      prepare: (scope, b) => scope.read<BookingPrivateDetailsDoc>(privateDetailsRef(scope, b.id)),
      apply: ({ scope, writer, booking, actorUid, actorName, now }, details) => {
        const current = details?.[kind] ?? null;
        if (!current) {
          throw new ConflictException(`There is no ${KIND_LABEL[kind]} arrangement to acknowledge yet.`, {
            reason: "no_arrangement",
          });
        }
        if (current.revision !== body.arrangementRevision) {
          throw new ConflictException(
            `The ${KIND_LABEL[kind]} arrangement changed. Review the latest version before acknowledging.`,
            { reason: "stale_arrangement" },
          );
        }
        if (current.proposedByUid === actorUid) {
          throw new ForbiddenException("The other member acknowledges the arrangement you proposed.");
        }
        if (current.acknowledgedByUid) return current;
        const updated: ArrangementDto = { ...current, acknowledgedByUid: actorUid, acknowledgedAt: now };
        const nextDetails: BookingPrivateDetailsDoc = { ...details!, updatedAt: now };
        nextDetails[kind] = updated;
        scope.buffer.set(privateDetailsRef(scope, booking.id), nextDetails);
        const seq = writer.record(
          `${kind}_arrangement_acknowledged`,
          actorUid,
          `${KIND_LABEL[kind] === "pickup" ? "Pickup" : "Return"} arrangement acknowledged (version ${current.revision}).`,
        );
        writer.notify(seq, {
          recipientUid: current.proposedByUid,
          type: "arrangement_acknowledged",
          title: `${KIND_LABEL[kind] === "pickup" ? "Pickup" : "Return"} arrangement agreed`,
          body: `${actorName} acknowledged the ${KIND_LABEL[kind]} arrangement for ${booking.termsSnapshot.titleEn}.`,
        });
        return updated;
      },
    });
    return result;
  }

  // ─── Condition records ───

  async submitConditionReport(
    uid: string,
    bookingId: string,
    stage: ConditionStage,
    body: ConditionReportBody,
  ): Promise<ConditionReportDoc> {
    return this.writeConditionReport(uid, bookingId, stage, body, "first");
  }

  /** A correction is a new version that supersedes the latest one; the original stays readable. */
  async correctConditionReport(
    uid: string,
    bookingId: string,
    stage: ConditionStage,
    body: ConditionReportBody,
  ): Promise<ConditionReportDoc> {
    return this.writeConditionReport(uid, bookingId, stage, body, "correction");
  }

  private async writeConditionReport(
    uid: string,
    bookingId: string,
    stage: ConditionStage,
    body: ConditionReportBody,
    mode: "first" | "correction",
  ): Promise<ConditionReportDoc> {
    const command =
      mode === "first"
        ? stage === "collection"
          ? "submit_collection_condition"
          : "submit_return_condition"
        : stage === "collection"
          ? "correct_collection_condition"
          : "correct_return_condition";
    const { result } = await this.runner.run(bookingId, uid, {
      command,
      prepare: async (scope, b) => {
        const snap = await scope.tx.get(
          scope.db.collection(COLLECTIONS.conditionReports).where("bookingId", "==", b.id),
        );
        const all = snap.docs.map((d) => withVersion(d.data() as ConditionReportDoc));
        const media: (MediaDocument | null)[] = [];
        for (const mediaId of body.mediaIds) {
          media.push(await scope.read<MediaDocument>(scope.db.collection(COLLECTIONS.media).doc(mediaId)));
        }
        return { all, latest: latestByStage(all)[stage], media };
      },
      apply: ({ scope, writer, booking, actorUid, actorName, otherUid, now }, { all, latest, media }) => {
        // A repeated submission with the same client id returns what was stored.
        const repeat = all.find((r) => r.stage === stage && r.clientRequestId === body.clientRequestId);
        if (repeat) return repeat;
        if (mode === "first" && latest) {
          throw new ConflictException(`The ${stage} condition record was already submitted.`, {
            reason: "already_submitted",
          });
        }
        if (mode === "correction") {
          if (!latest) {
            throw new ConflictException(`There is no ${stage} condition record to correct yet.`, {
              reason: "no_condition_record",
            });
          }
          if (latest.submittedByUid !== actorUid) {
            throw new ForbiddenException("Only the member who recorded the condition can correct it.");
          }
        }
        media.forEach((m, i) => {
          const ok =
            !!m &&
            m.ownerUid === actorUid &&
            m.purpose === "condition" &&
            !m.listingId &&
            !m.parentId &&
            m.uploadState === "pending";
          if (!ok) {
            throw new ValidationException([
              {
                field: `mediaIds.${i}`,
                message: "Each photo must be your own new condition photo upload.",
              },
            ]);
          }
        });

        const version = mode === "first" ? 1 : latest!.version + 1;
        const reportId = versionId(booking.id, stage, version);
        const report: ConditionReportDoc = {
          id: reportId,
          bookingId: booking.id,
          stage,
          version,
          supersedesId: mode === "correction" ? latest!.id : null,
          submittedByUid: actorUid,
          overallCondition: body.overallCondition,
          checklist: body.checklist,
          notes: body.notes ?? "",
          mediaIds: body.mediaIds ?? [],
          status: "submitted",
          submittedAt: now,
          acknowledgement: null,
          clientRequestId: body.clientRequestId,
        };
        scope.buffer.set(scope.db.collection(COLLECTIONS.conditionReports).doc(reportId), report);
        for (const mediaId of report.mediaIds) {
          scope.buffer.set(
            scope.db.collection(COLLECTIONS.media).doc(mediaId),
            {
              uploadState: "attached",
              parentType: "conditionReport",
              parentId: reportId,
              bookingId: booking.id,
              expiresAt: null,
            },
            { merge: true },
          );
        }
        const label = stage === "collection" ? "Collection" : "Return";
        const seq = writer.record(
          mode === "first" ? `${stage}_condition_recorded` : `${stage}_condition_corrected`,
          actorUid,
          mode === "first"
            ? `${label} condition recorded (${body.overallCondition}, ${report.mediaIds.length} photo${report.mediaIds.length === 1 ? "" : "s"}).`
            : `${label} condition corrected: version ${version} replaces version ${version - 1}, which stays readable.`,
        );
        if (stage === "collection") {
          writer.notify(seq, {
            recipientUid: otherUid,
            type: "collection_recorded",
            title: mode === "first" ? "Collection record ready" : "Collection record corrected",
            body: `${actorName} ${mode === "first" ? "recorded" : "corrected"} the condition of ${booking.termsSnapshot.titleEn}. Review it and acknowledge or record a disagreement.`,
          });
        } else if (mode === "correction") {
          writer.notify(seq, {
            recipientUid: otherUid,
            type: "return_recorded",
            title: "Return record corrected",
            body: `${actorName} corrected the return condition record of ${booking.termsSnapshot.titleEn}. The earlier version stays readable.`,
          });
        }
        return report;
      },
    });
    return result;
  }

  /** Borrower agrees (booking becomes active) or records a disagreement (it does not). */
  async acknowledgeCollection(
    uid: string,
    bookingId: string,
    body: ConditionAcknowledgeBody,
  ): Promise<BookingDoc> {
    const { booking } = await this.runner.run(bookingId, uid, {
      command: "acknowledge_collection",
      expectedRevision: body.expectedRevision,
      prepare: async (scope, b) => {
        const snap = await scope.tx.get(
          scope.db.collection(COLLECTIONS.conditionReports).where("bookingId", "==", b.id),
        );
        return latestByStage(snap.docs.map((d) => d.data() as ConditionReportDoc)).collection;
      },
      apply: ({ scope, writer, booking, actorUid, actorName, otherUid, now }, report) => {
        if (!report) {
          throw new ConflictException("The owner has not recorded the collection condition yet.", {
            reason: "no_condition_record",
          });
        }
        if (report.acknowledgement?.decision === "agreed") {
          throw new ConflictException("The collection record was already acknowledged.", {
            reason: "already_acknowledged",
          });
        }
        const acknowledgement = {
          decision: body.decision,
          byUid: actorUid,
          ...(body.note ? { note: body.note } : {}),
          at: now,
        };
        scope.buffer.set(scope.db.collection(COLLECTIONS.conditionReports).doc(report.id), { ...report, acknowledgement });
        const title = booking.termsSnapshot.titleEn;
        if (body.decision === "agreed") {
          const seq = writer.transition("active", actorUid, "collected", "Collection record acknowledged.");
          writer.set({ collectedAt: now });
          writer.notify(seq, {
            recipientUid: otherUid,
            type: "collection_acknowledged",
            title: "Collection confirmed",
            body: `${actorName} agreed with the collection record. ${title} is now in use until ${formatRiyadh(booking.endAt)}.`,
          });
        } else {
          const seq = writer.record("collection_disagreed", actorUid, body.note);
          writer.notify(seq, {
            recipientUid: otherUid,
            type: "collection_disagreed",
            title: "Collection record disputed",
            body: `${actorName} recorded a disagreement with the collection record for ${title}. Talk it through, or cancel before collection.`,
          });
        }
      },
    });
    return booking;
  }

  // ─── Return and closure ───

  async reportReturn(uid: string, bookingId: string, expectedRevision: number): Promise<BookingDoc> {
    const { booking } = await this.runner.run(bookingId, uid, {
      command: "report_return",
      expectedRevision,
      apply: ({ scope, writer, booking, actorUid, actorName, otherUid, now }) => {
        const seq = writer.transition("return_pending", actorUid, "return_reported");
        writer.set({ returnReportedAt: now });
        scope.hold(booking.id);
        writer.notify(seq, {
          recipientUid: otherUid,
          type: "return_reported",
          title: "Item returned",
          body: `${actorName} reported returning ${booking.termsSnapshot.titleEn}. Check it and confirm receipt.`,
        });
      },
    });
    return booking;
  }

  async confirmReceipt(uid: string, bookingId: string, expectedRevision: number): Promise<BookingDoc> {
    const { booking } = await this.runner.run(bookingId, uid, {
      command: "confirm_receipt",
      expectedRevision,
      prepare: (scope, b) => readDeposit(scope, b.id),
      apply: ({ scope, writer, booking, actorUid, actorName, otherUid, now }, deposit) => {
        const refunded = refundHeldDeposit(scope, booking.id, deposit);
        const seq = writer.transition(
          "completed",
          actorUid,
          "completed",
          refunded > 0 ? "Receipt confirmed; deposit released (simulated)." : "Receipt confirmed.",
        );
        writer.set({ completedAt: now });
        scope.releaseReservation(booking.id);
        scope.releaseHold(booking.id);
        writer.notify(seq, {
          recipientUid: otherUid,
          type: "booking_completed",
          title: "Exchange completed",
          body: `${actorName} confirmed receiving ${booking.termsSnapshot.titleEn}.${
            refunded > 0 ? " Your deposit was released (simulated)." : ""
          }`,
        });
      },
    });
    return booking;
  }

  /**
   * POST /me/bookings/:id/dispute. During the exchange (active, overdue,
   * return pending) the booking becomes disputed, the item is held and the
   * deposit goes under review. After completion, within the review window,
   * it is a complaint: the booking is not reopened and no money moves.
   */
  async openDispute(
    uid: string,
    bookingId: string,
    body: OpenDisputeBody,
  ): Promise<{ booking: BookingDoc; dispute: DisputeDoc }> {
    const pre = await this.runner.getForParticipant(bookingId, uid);
    if (pre.status === "completed") return this.openComplaint(uid, pre, body);

    const { booking, result } = await this.runner.run(bookingId, uid, {
      command: "report_issue",
      expectedRevision: body.expectedRevision,
      prepare: async (scope, b) => ({
        deposit: await readDeposit(scope, b.id),
        existing: await scope.read<DisputeDoc>(disputeRef(scope, b.id)),
        reportIds: await conditionReportIds(scope, b.id),
      }),
      apply: ({ scope, writer, booking, actorUid, actorName, otherUid, now }, { deposit, existing, reportIds }) => {
        if (existing) {
          throw new ConflictException("A case already exists for this booking.", {
            reason: "dispute_exists",
            disputeId: existing.id,
          });
        }
        const disputeId = disputeIdFor(booking.id);
        const seq = writer.transition("disputed", actorUid, "issue_reported", ISSUE_LABELS[body.issue]);
        writer.set({ disputedAt: now, disputeId });
        scope.hold(booking.id);
        if (deposit && deposit.heldHalalas > 0) {
          scope.buffer.set(scope.db.collection(COLLECTIONS.deposits).doc(booking.id), {
            ...deposit,
            status: "under_review",
            revision: deposit.revision + 1,
            updatedAt: now,
          });
        }
        const dispute = newDisputeDoc({
          id: disputeId,
          bookingId: booking.id,
          kind: "exchange",
          openedByUid: actorUid,
          issue: body.issue,
          description: body.description,
          linkedConditionReportIds: reportIds,
          heldDepositHalalas: deposit?.heldHalalas ?? 0,
          now,
        });
        scope.buffer.set(disputeRef(scope, booking.id), dispute);
        writer.notify(seq, {
          recipientUid: otherUid,
          type: "issue_reported",
          title: "Issue reported",
          body: `${actorName} reported an issue with the exchange of ${booking.termsSnapshot.titleEn}. ${
            deposit && deposit.heldHalalas > 0
              ? "The simulated deposit stays on hold until an admin decides."
              : "An admin will look at the case."
          }`,
        });
        return dispute;
      },
    });
    return { booking, dispute: result };
  }

  /** Post-completion complaint: linked to the booking, which stays completed. */
  private async openComplaint(
    uid: string,
    pre: BookingDoc,
    body: OpenDisputeBody,
  ): Promise<{ booking: BookingDoc; dispute: DisputeDoc }> {
    const windowEnd = pre.completedAt ? addDays(pre.completedAt, TRUST_CONFIG.reviewWindowDays) : null;
    if (!windowEnd || toMillis(windowEnd) < Date.now()) {
      throw new ConflictException("The window for raising a complaint about this exchange has closed.", {
        reason: "window_closed",
      });
    }
    const db = this.firebase.firestore;
    const actorName = (await db.collection(COLLECTIONS.users).doc(uid).get()).data()?.["displayName"] ?? "A member";
    return db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      const bookingRef = db.collection(COLLECTIONS.bookings).doc(pre.id);
      const booking = (await tx.get(bookingRef)).data() as BookingDoc;
      if (booking.revision !== body.expectedRevision) {
        throw new ConflictException("This booking changed. Refresh to see the latest version.", {
          reason: "stale_revision",
        });
      }
      const ref = db.collection(COLLECTIONS.disputes).doc(disputeIdFor(booking.id));
      if ((await tx.get(ref)).exists) {
        throw new ConflictException("A case already exists for this booking.", { reason: "dispute_exists" });
      }
      const reportsSnap = await tx.get(
        db.collection(COLLECTIONS.conditionReports).where("bookingId", "==", booking.id),
      );
      const dispute = newDisputeDoc({
        id: ref.id,
        bookingId: booking.id,
        kind: "complaint",
        openedByUid: uid,
        issue: body.issue,
        description: body.description,
        linkedConditionReportIds: reportsSnap.docs.map((d) => d.id).sort(),
        heldDepositHalalas: 0,
        now,
      });
      const buffer = new WriteBuffer();
      buffer.set(ref, dispute);
      const writer = new BookingEventWriter(booking, now);
      const seq = writer.record("complaint_opened", uid, ISSUE_LABELS[body.issue]);
      writer.set({ disputeId: ref.id });
      writer.notify(seq, {
        recipientUid: writer.otherParticipant(uid),
        type: "dispute_opened",
        title: "Complaint about a completed exchange",
        body: `${actorName} raised a complaint about the exchange of ${booking.termsSnapshot.titleEn}. An admin will look at it; the completed booking and its payments are not changed.`,
      });
      writer.writeTo(buffer, db);
      buffer.flush(tx);
      return { booking: writer.booking, dispute };
    });
  }

  /** Sprint 2 route kept for compatibility: now opens a dispute case. */
  async reportIssue(uid: string, bookingId: string, body: ReportIssueBody): Promise<BookingDoc> {
    const { booking } = await this.openDispute(uid, bookingId, {
      expectedRevision: body.expectedRevision,
      issue: "other",
      description: body.reason,
    });
    return booking;
  }

  // ─── Condition photos (participants only) ───

  async getConditionPhoto(
    uid: string,
    bookingId: string,
    mediaId: string,
    variant: "main" | "thumbnail",
  ): Promise<{ bytes: Buffer; mimeType: string }> {
    await this.runner.getForParticipant(bookingId, uid);
    const snap = await this.firebase.firestore.collection(COLLECTIONS.media).doc(mediaId).get();
    const media = snap.exists ? (snap.data() as MediaDocument) : null;
    if (!media || media.purpose !== "condition" || media.bookingId !== bookingId) {
      throw new NotFoundException("Photo not found");
    }
    try {
      const bytes = decodeImageBytes(variant === "main" ? media.mainBase64 : media.thumbnailBase64);
      return { bytes, mimeType: media.mimeType };
    } catch {
      throw new NotFoundException("Photo not found");
    }
  }
}
