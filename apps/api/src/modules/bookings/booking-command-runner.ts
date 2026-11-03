/**
 * BookingCommandRunner — the one path for commands on an existing booking.
 *
 * For every command it: hides the booking from non-participants (404), runs a
 * calendar-guard transaction, re-reads the booking, applies any transition
 * that server time has made due (expiry, overdue), checks the actor's role,
 * the current state and the expected revision, then lets the command write
 * its changes, timeline event and notifications together.
 *
 * When a due transition happened but the command itself is refused (for
 * example confirming an expired hold), the transition is still committed and
 * the refusal is returned afterwards, so the expiry is never lost.
 */

import { Injectable } from "@nestjs/common";
import {
  dueSystemTransition,
  roleMayRun,
  statusAllows,
  type BookingCommand,
  type ParticipantRole,
} from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "../../common/errors/api-exceptions.js";
import {
  CalendarGuardService,
  applySystemTransition,
  type CalendarScope,
} from "../exchange/calendar-guard.service.js";
import { BookingEventWriter } from "../exchange/booking-event-writer.js";
import type { BookingDoc } from "../exchange/exchange.types.js";
import { MemberDirectory } from "../exchange/member-directory.service.js";

export interface CommandContext {
  scope: CalendarScope;
  writer: BookingEventWriter;
  booking: BookingDoc;
  role: ParticipantRole;
  actorUid: string;
  actorName: string;
  otherUid: string;
  now: string;
}

export interface CommandSpec<P, R> {
  command: BookingCommand;
  /** Booking revision the client last saw; omitted when the command has its own versioning. */
  expectedRevision?: number;
  /** Extra reads (no writes) after the booking is loaded. */
  prepare?: (scope: CalendarScope, booking: BookingDoc) => Promise<P>;
  /** Rules and buffered writes. Throwing an ApiException refuses with nothing written. */
  apply: (ctx: CommandContext, prepared: P) => R | Promise<R>;
}

const VERBS: Record<BookingCommand, string> = {
  accept: "accepted",
  decline: "declined",
  confirm: "confirmed",
  cancel: "cancelled",
  submit_collection_condition: "given a collection record",
  acknowledge_collection: "acknowledged",
  submit_return_condition: "given a return record",
  report_return: "reported as returned",
  confirm_receipt: "completed",
  report_issue: "reported",
  arrange_pickup: "given a pickup arrangement",
  arrange_return: "given a return arrangement",
  correct_collection_condition: "given a corrected collection record",
  correct_return_condition: "given a corrected return record",
};

const ROLE_MESSAGES: Partial<Record<BookingCommand, string>> = {
  accept: "Only the owner can accept a request.",
  decline: "Only the owner can decline a request.",
  confirm: "Only the borrower can confirm the booking.",
  submit_collection_condition: "The owner records the condition at collection.",
  acknowledge_collection: "The borrower acknowledges the collection record.",
  submit_return_condition: "The borrower records the condition at return.",
  report_return: "The borrower reports the return.",
  confirm_receipt: "The owner confirms receipt.",
  correct_collection_condition: "Only the owner can correct the collection record.",
  correct_return_condition: "Only the borrower can correct the return record.",
};

@Injectable()
export class BookingCommandRunner {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly calendar: CalendarGuardService,
    private readonly members: MemberDirectory,
  ) {}

  /** Loads a booking for a participant, or throws 404 for anyone else. */
  async getForParticipant(bookingId: string, uid: string): Promise<BookingDoc> {
    const snap = await this.firebase.firestore.collection(COLLECTIONS.bookings).doc(bookingId).get();
    const booking = snap.exists ? (snap.data() as BookingDoc) : null;
    if (!booking || (booking.ownerUid !== uid && booking.borrowerUid !== uid)) {
      throw new NotFoundException("Booking not found");
    }
    return booking;
  }

  async run<P, R>(
    bookingId: string,
    actorUid: string,
    spec: CommandSpec<P, R>,
  ): Promise<{ booking: BookingDoc; result: R }> {
    const before = await this.getForParticipant(bookingId, actorUid);
    const names = await this.members.displayNames([before.ownerUid, before.borrowerUid]);

    const outcome = await this.calendar.withListingCalendar(before.listingId, async (scope) => {
      const booking = await scope.readBooking(bookingId);
      if (!booking) throw new NotFoundException("Booking not found");

      const writer = new BookingEventWriter(booking, scope.now);
      const role: ParticipantRole = actorUid === booking.ownerUid ? "owner" : "borrower";
      const planned = scope.claim(bookingId);
      const due = planned ?? dueSystemTransition(booking, scope.now);
      const prepared = spec.prepare ? await spec.prepare(scope, booking) : (undefined as P);

      if (due) applySystemTransition(scope, writer, due);

      const refusal = this.refusal(spec.command, spec.expectedRevision, writer, role, due === "expired");
      if (refusal) {
        writer.writeTo(scope.buffer, scope.db);
        return { refusal };
      }

      const result = await spec.apply(
        {
          scope,
          writer,
          booking: writer.booking,
          role,
          actorUid,
          actorName: names.get(actorUid) ?? "Member",
          otherUid: writer.otherParticipant(actorUid),
          now: scope.now,
        },
        prepared,
      );
      writer.writeTo(scope.buffer, scope.db);
      return { booking: writer.booking, result };
    });

    if ("refusal" in outcome) throw outcome.refusal;
    return outcome;
  }

  private refusal(
    command: BookingCommand,
    expectedRevision: number | undefined,
    writer: BookingEventWriter,
    role: ParticipantRole,
    justExpired: boolean,
  ): Error | null {
    const status = writer.booking.status;
    if (!roleMayRun(command, role)) {
      return new ForbiddenException(ROLE_MESSAGES[command] ?? "You cannot do this on this booking.");
    }
    if (!statusAllows(command, status)) {
      if (justExpired) {
        return new ConflictException(
          "This booking expired before it could be " + VERBS[command] + ". Check availability again.",
          { reason: "expired", status },
        );
      }
      return new ConflictException(
        `This booking is ${status.replace("_", " ")} and cannot be ${VERBS[command]}.`,
        { reason: "invalid_state", status },
      );
    }
    if (expectedRevision !== undefined && expectedRevision !== writer.revisionAsRead) {
      return new ConflictException("This booking changed. Refresh to see the latest version.", {
        reason: "stale_revision",
        status,
      });
    }
    return null;
  }
}
