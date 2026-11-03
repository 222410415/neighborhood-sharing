/**
 * Reviews — only the two participants of a completed booking, once each,
 * within the review window. A review is about the other member. Moderation
 * can hide a review with a reason; it never edits the rating. Reputation is
 * computed from visible reviews when read, never stored as an editable field.
 */

import { Injectable } from "@nestjs/common";
import {
  TRUST_CONFIG,
  addDays,
  toMillis,
  type CreateReviewBody,
  type ReputationDto,
  type ReviewDto,
} from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import {
  ConflictException,
  NotFoundException,
} from "../../common/errors/api-exceptions.js";
import type { BookingDoc } from "../exchange/exchange.types.js";
import { BookingEventWriter } from "../exchange/booking-event-writer.js";
import { WriteBuffer } from "../exchange/write-buffer.js";
import { MemberDirectory } from "../exchange/member-directory.service.js";
import { AuditService } from "../roles/audit.service.js";

export interface ReviewDoc {
  id: string;
  bookingId: string;
  listingId: string;
  authorUid: string;
  recipientUid: string;
  recipientRole: "owner" | "borrower";
  rating: number;
  comment: string;
  createdAt: string;
  moderationStatus: "visible" | "hidden";
  hiddenReason: string | null;
  hiddenByUid: string | null;
  hiddenAt: string | null;
}

export function reviewId(bookingId: string, authorUid: string): string {
  return `${bookingId}_${authorUid}`;
}

/** End of the review window, or null if the booking is not completed. */
export function reviewWindowEnd(booking: Pick<BookingDoc, "status" | "completedAt">): string | null {
  if (booking.status !== "completed" || !booking.completedAt) return null;
  return addDays(booking.completedAt, TRUST_CONFIG.reviewWindowDays);
}

@Injectable()
export class ReviewService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly members: MemberDirectory,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  /** POST /me/bookings/:id/review */
  async create(uid: string, bookingId: string, body: CreateReviewBody): Promise<ReviewDto> {
    const bookingRef = this.db.collection(COLLECTIONS.bookings).doc(bookingId);
    const pre = (await bookingRef.get()).data() as BookingDoc | undefined;
    if (!pre || (pre.ownerUid !== uid && pre.borrowerUid !== uid)) {
      throw new NotFoundException("Booking not found");
    }
    const names = await this.members.displayNames([uid]);
    const authorName = names.get(uid) ?? "A neighbor";

    const review = await this.db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      const snap = await tx.get(bookingRef);
      const booking = snap.data() as BookingDoc;
      if (booking.status !== "completed") {
        throw new ConflictException("Reviews open once the exchange is completed.", {
          reason: "not_completed",
          status: booking.status,
        });
      }
      const windowEnd = reviewWindowEnd(booking);
      if (!windowEnd || toMillis(windowEnd) < toMillis(now)) {
        throw new ConflictException("The review window for this exchange has closed.", {
          reason: "window_closed",
        });
      }
      const ref = this.db.collection(COLLECTIONS.reviews).doc(reviewId(bookingId, uid));
      if ((await tx.get(ref)).exists) {
        throw new ConflictException("You have already reviewed this exchange.", { reason: "already_reviewed" });
      }
      const recipientUid = uid === booking.ownerUid ? booking.borrowerUid : booking.ownerUid;
      const doc: ReviewDoc = {
        id: ref.id,
        bookingId,
        listingId: booking.listingId,
        authorUid: uid,
        recipientUid,
        recipientRole: recipientUid === booking.ownerUid ? "owner" : "borrower",
        rating: body.rating,
        comment: body.comment ?? "",
        createdAt: now,
        moderationStatus: "visible",
        hiddenReason: null,
        hiddenByUid: null,
        hiddenAt: null,
      };
      const buffer = new WriteBuffer();
      buffer.set(ref, doc);
      const writer = new BookingEventWriter(booking, now);
      const seq = writer.record("review_left", uid);
      writer.set({
        reviewState: {
          ...(booking.reviewState ?? {}),
          [uid === booking.ownerUid ? "ownerReviewed" : "borrowerReviewed"]: true,
        },
      });
      writer.notify(seq, {
        recipientUid,
        type: "review_received",
        title: "New review",
        body: `${authorName} reviewed your exchange of ${booking.termsSnapshot.titleEn}.`,
      });
      writer.writeTo(buffer, this.db);
      buffer.flush(tx);
      return doc;
    });
    return this.toDto(review, authorName);
  }

  private toDto(doc: ReviewDoc, authorName: string): ReviewDto {
    return {
      id: doc.id,
      bookingId: doc.bookingId,
      authorUid: doc.authorUid,
      authorName,
      recipientUid: doc.recipientUid,
      recipientRole: doc.recipientRole,
      rating: doc.rating,
      comment: doc.comment,
      createdAt: doc.createdAt,
      moderationStatus: doc.moderationStatus,
    };
  }

  private async visibleFor(uid: string): Promise<ReviewDoc[]> {
    const snap = await this.db
      .collection(COLLECTIONS.reviews)
      .where("recipientUid", "==", uid)
      .where("moderationStatus", "==", "visible")
      .get();
    return snap.docs.map((d) => d.data() as ReviewDoc).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Visible reviews about a member, newest first. */
  async listForMember(uid: string, limit = 50): Promise<ReviewDto[]> {
    const docs = (await this.visibleFor(uid)).slice(0, limit);
    const names = await this.members.displayNames(docs.map((d) => d.authorUid));
    return docs.map((d) => this.toDto(d, names.get(d.authorUid) ?? "Member"));
  }

  /** Computed from visible reviews only; hidden reviews never count. */
  async reputation(uid: string): Promise<ReputationDto> {
    const docs = await this.visibleFor(uid);
    if (docs.length === 0) return { reviewCount: 0, averageRating: null };
    const sum = docs.reduce((acc, d) => acc + d.rating, 0);
    return { reviewCount: docs.length, averageRating: Math.round((sum / docs.length) * 10) / 10 };
  }

  /** Admin: hide a review with a reason (the rating is never edited). */
  async hide(reviewerUid: string, id: string, reason: string, requestId: string | null): Promise<ReviewDto> {
    const ref = this.db.collection(COLLECTIONS.reviews).doc(id);
    const doc = await this.db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      const snap = await tx.get(ref);
      const review = snap.exists ? (snap.data() as ReviewDoc) : null;
      if (!review) throw new NotFoundException("Review not found");
      if (review.authorUid === reviewerUid || review.recipientUid === reviewerUid) {
        throw new ConflictException(
          "You are part of this review, so another reviewer must moderate it.",
          { reason: "conflict_of_interest" },
        );
      }
      if (review.moderationStatus === "hidden") return review;
      const updated: ReviewDoc = {
        ...review,
        moderationStatus: "hidden",
        hiddenReason: reason,
        hiddenByUid: reviewerUid,
        hiddenAt: now,
      };
      const buffer = new WriteBuffer();
      buffer.set(ref, updated);
      this.audit.inBuffer(buffer, this.db, {
        actorUid: reviewerUid,
        action: "review.hide",
        entityType: "review",
        entityId: id,
        requestId,
        reason,
      }, now);
      buffer.flush(tx);
      return updated;
    });
    const name = await this.members.displayName(doc.authorUid);
    return this.toDto(doc, name);
  }

  /** Review state of one booking for one participant (booking detail). */
  async reviewsForBooking(bookingId: string, uid: string, otherUid: string) {
    const [mine, theirs] = await this.db.getAll(
      this.db.collection(COLLECTIONS.reviews).doc(reviewId(bookingId, uid)),
      this.db.collection(COLLECTIONS.reviews).doc(reviewId(bookingId, otherUid)),
    );
    return {
      mine: mine?.exists ? (mine.data() as ReviewDoc) : null,
      theirsSubmitted: !!theirs?.exists,
    };
  }
}
