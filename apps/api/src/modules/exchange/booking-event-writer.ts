/**
 * BookingEventWriter — records a booking's state change, its append-only
 * timeline event and the resulting notifications in the same transaction.
 *
 * It works on an in-memory copy of the booking and writes everything through
 * a WriteBuffer, so the booking document is written once per transaction.
 * Event ids are {bookingId}_{sequence}; notification ids are derived from the
 * event and recipient, so a notification can never be written twice.
 */

import type { Firestore } from "firebase-admin/firestore";
import {
  canTransition,
  type BookingStatus,
  type NotificationType,
  type ParticipantRole,
} from "@neighborhood/contracts";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import type { BookingDoc, BookingEventDoc, NotificationDoc } from "./exchange.types.js";
import { SYSTEM_ACTOR } from "./exchange.types.js";
import { ids } from "./ids.js";
import type { WriteBuffer } from "./write-buffer.js";

export interface NotificationInput {
  recipientUid: string;
  type: NotificationType;
  title: string;
  body: string;
}

export class BookingEventWriter {
  private readonly events: BookingEventDoc[] = [];
  private readonly notifications: NotificationDoc[] = [];
  /** Revision as read, before this transaction changed anything. */
  readonly revisionAsRead: number;

  constructor(
    readonly booking: BookingDoc,
    private readonly now: string,
  ) {
    this.revisionAsRead = booking.revision;
  }

  roleOf(uid: string): ParticipantRole | "system" {
    if (uid === this.booking.ownerUid) return "owner";
    if (uid === this.booking.borrowerUid) return "borrower";
    return "system";
  }

  otherParticipant(uid: string): string {
    return uid === this.booking.ownerUid ? this.booking.borrowerUid : this.booking.ownerUid;
  }

  /** First event of a newly created booking. */
  created(actorUid: string, eventType: string, note?: string): number {
    return this.append(null, this.booking.status, actorUid, eventType, note);
  }

  /** Status change: checks the transition table and bumps the revision. */
  transition(to: BookingStatus, actorUid: string, eventType: string, note?: string): number {
    const from = this.booking.status;
    if (!canTransition(from, to)) {
      throw new Error(`Illegal booking transition ${from} -> ${to}`);
    }
    this.booking.status = to;
    this.booking.revision += 1;
    return this.append(from, to, actorUid, eventType, note);
  }

  /** Timeline event without a status change (arrangements, condition records). */
  record(eventType: string, actorUid: string, note?: string): number {
    return this.append(this.booking.status, this.booking.status, actorUid, eventType, note);
  }

  set(fields: Partial<BookingDoc>): void {
    Object.assign(this.booking, fields);
  }

  /** Notification tied to an event sequence; previews must stay safe. */
  notify(sequence: number, input: NotificationInput): void {
    this.notifications.push({
      id: ids.bookingNotification(this.booking.id, sequence, input.recipientUid),
      recipientUid: input.recipientUid,
      type: input.type,
      entityType: "booking",
      entityId: this.booking.id,
      title: input.title,
      body: input.body,
      actionPath: `/bookings/${this.booking.id}`,
      createdAt: this.now,
      readAt: null,
    });
  }

  get hasChanges(): boolean {
    return this.events.length > 0;
  }

  writeTo(buffer: WriteBuffer, db: Firestore): void {
    if (!this.hasChanges) return;
    this.booking.updatedAt = this.now;
    buffer.set(db.collection(COLLECTIONS.bookings).doc(this.booking.id), this.booking);
    for (const event of this.events) {
      buffer.set(db.collection(COLLECTIONS.bookingEvents).doc(event.id), event);
    }
    for (const notification of this.notifications) {
      buffer.set(db.collection(COLLECTIONS.notifications).doc(notification.id), notification);
    }
  }

  private append(
    from: BookingStatus | null,
    to: BookingStatus,
    actorUid: string,
    eventType: string,
    note?: string,
  ): number {
    const sequence = this.booking.lastEventSequence + 1;
    this.booking.lastEventSequence = sequence;
    const event: BookingEventDoc = {
      id: ids.bookingEvent(this.booking.id, sequence),
      bookingId: this.booking.id,
      sequence,
      eventType,
      fromStatus: from,
      toStatus: to,
      actorUid,
      actorRole: actorUid === SYSTEM_ACTOR ? "system" : this.roleOf(actorUid),
      occurredAt: this.now,
    };
    if (note) event.note = note;
    this.events.push(event);
    return sequence;
  }
}
