/**
 * CalendarGuardService — the single concurrency guard for a listing's calendar.
 *
 * Every operation that affects reservations, owner blocks or possession runs in
 * `withListingCalendar(listingId, fn)`. The transaction reads and rewrites
 * `calendarControls/{listingId}`, so competing commands for the same item
 * contend on one document and Firestore retries the loser against fresh data.
 * It also reads all live blocks of the listing and applies due system
 * transitions (expired holds, overdue exchanges) found among them.
 *
 * No external calls happen inside the transaction; the callback may run more
 * than once under contention.
 */

import { Injectable, Logger } from "@nestjs/common";
import type { DocumentReference, Firestore, Transaction } from "firebase-admin/firestore";
import {
  GUARD_BLOCKING_STATUSES,
  dueSystemTransition,
  findOverlaps,
  toMillis,
  type BookingStatus,
  type Interval,
  type SystemTransition,
} from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import type {
  AvailabilityBlockDoc,
  BookingDoc,
  CalendarControlDoc,
  ItemHold,
} from "./exchange.types.js";
import { SYSTEM_ACTOR } from "./exchange.types.js";
import { BookingEventWriter } from "./booking-event-writer.js";
import { WriteBuffer } from "./write-buffer.js";
import { ids } from "./ids.js";

function isCandidateForSystemTransition(block: AvailabilityBlockDoc, now: string): boolean {
  if (block.kind !== "reservation" || !block.bookingId) return false;
  const nowMs = toMillis(now);
  return (
    (!!block.holdExpiresAt && toMillis(block.holdExpiresAt) <= nowMs) ||
    toMillis(block.endAt) <= nowMs
  );
}

export class CalendarScope {
  readonly buffer = new WriteBuffer();
  private guard: CalendarControlDoc;
  private liveBlocks: AvailabilityBlockDoc[] = [];
  private readonly addedBlocks: AvailabilityBlockDoc[] = [];
  private readonly releasedBlockIds = new Set<string>();
  private readonly bookingCache = new Map<string, BookingDoc>();
  private readonly planned = new Map<string, SystemTransition>();
  private readonly claimed = new Set<string>();
  private blockingBookingId: string | null = null;
  private itemHold: ItemHold | null = null;
  /** Intervals released in this transaction (reservations or owner blocks). */
  readonly releasedIntervals: Interval[] = [];
  availabilityRevision = 0;

  constructor(
    readonly db: Firestore,
    readonly tx: Transaction,
    readonly listingId: string,
    readonly now: string,
  ) {
    this.guard = { listingId, revision: 0, blockingBookingId: null, updatedAt: now };
  }

  private get guardRef(): DocumentReference {
    return this.db.collection(COLLECTIONS.calendarControls).doc(this.listingId);
  }

  bookingRef(id: string): DocumentReference {
    return this.db.collection(COLLECTIONS.bookings).doc(id);
  }

  blockRef(id: string): DocumentReference {
    return this.db.collection(COLLECTIONS.availabilityBlocks).doc(id);
  }

  /**
   * Reads the guard, the live blocks and the bookings behind every live
   * reservation, plans due system transitions, and derives the hold from the
   * bookings' real states (so the guard heals itself if it was ever stale).
   */
  async load(): Promise<void> {
    const guardSnap = await this.tx.get(this.guardRef);
    if (guardSnap.exists) {
      this.guard = guardSnap.data() as CalendarControlDoc;
    }

    const blocksSnap = await this.tx.get(
      this.db
        .collection(COLLECTIONS.availabilityBlocks)
        .where("listingId", "==", this.listingId)
        .where("status", "==", "live"),
    );
    this.liveBlocks = blocksSnap.docs.map((d) => d.data() as AvailabilityBlockDoc);

    const reservationIds = [
      ...new Set(
        this.liveBlocks
          .filter((b) => b.kind === "reservation" && !!b.bookingId)
          .map((b) => b.bookingId as string),
      ),
    ];
    for (const id of reservationIds) {
      const booking = await this.readBooking(id);
      if (!booking) continue;
      const due = dueSystemTransition(booking, this.now);
      if (!due) continue;
      this.planned.set(id, due);
      // Reflect the planned effect now, so checks below see the true state.
      if (due === "expired") {
        this.noteRelease(ids.reservationBlock(id));
        this.releasedBlockIds.add(ids.reservationBlock(id));
      }
    }
    this.blockingBookingId = this.findBlockingBooking(this.guard.blockingBookingId ?? null);
    this.itemHold = this.guard.itemHold ?? null;
  }

  /** Status a loaded booking has, or will have once its planned transition is applied. */
  private effectiveStatus(booking: BookingDoc): BookingStatus {
    const due = this.planned.get(booking.id);
    if (due === "expired" && booking.status === "accepted") return "expired";
    if (due === "overdue" && booking.status === "active") return "overdue";
    return booking.status;
  }

  /** A loaded booking that should hold the item, preferring `preferred`. */
  private findBlockingBooking(preferred: string | null, excludeId?: string): string | null {
    const holding = [...this.bookingCache.values()]
      .filter((b) => b.listingId === this.listingId && b.id !== excludeId)
      .filter((b) => GUARD_BLOCKING_STATUSES.includes(this.effectiveStatus(b)))
      .sort((a, b) => toMillis(a.startAt) - toMillis(b.startAt));
    if (preferred && holding.some((b) => b.id === preferred)) return preferred;
    return holding[0]?.id ?? null;
  }

  // ─── Reads (all reads happen before the buffered writes are flushed) ───

  async readBooking(id: string): Promise<BookingDoc | null> {
    const cached = this.bookingCache.get(id);
    if (cached) return cached;
    const snap = await this.tx.get(this.bookingRef(id));
    if (!snap.exists) return null;
    const booking = snap.data() as BookingDoc;
    this.bookingCache.set(id, booking);
    return booking;
  }

  async read<T>(ref: DocumentReference): Promise<T | null> {
    const snap = await this.tx.get(ref);
    return snap.exists ? (snap.data() as T) : null;
  }

  // ─── Calendar state ───

  /** Live blocks that stop new reservations (expired holds excluded). */
  get blocks(): AvailabilityBlockDoc[] {
    return [
      ...this.liveBlocks.filter((b) => !this.releasedBlockIds.has(b.id)),
      ...this.addedBlocks.filter((b) => !this.releasedBlockIds.has(b.id)),
    ];
  }

  /**
   * True while an overdue, return-pending or disputed booking holds the item,
   * or while the item is lost or needs repair after a resolved dispute.
   */
  get onHold(): boolean {
    return this.blockingBookingId !== null || this.itemHold !== null;
  }

  get currentItemHold(): ItemHold | null {
    return this.itemHold;
  }

  /** Keep the item unavailable until the owner reactivates the listing. */
  setItemHold(hold: ItemHold): void {
    this.itemHold = hold;
  }

  clearItemHold(): void {
    this.itemHold = null;
  }

  conflicts(interval: Interval, ignoreBookingId?: string): AvailabilityBlockDoc[] {
    return findOverlaps(
      this.blocks.filter((b) => !ignoreBookingId || b.bookingId !== ignoreBookingId),
      interval,
    );
  }

  /**
   * The command takes charge of this booking: the guard will not apply its own
   * system transition to it. Returns the due transition the caller must apply.
   */
  claim(bookingId: string): SystemTransition | null {
    this.claimed.add(bookingId);
    return this.planned.get(bookingId) ?? null;
  }

  // ─── Buffered writes ───

  reserve(booking: BookingDoc, holdExpiresAt: string | null, actorUid: string): void {
    const block: AvailabilityBlockDoc = {
      id: ids.reservationBlock(booking.id),
      listingId: booking.listingId,
      kind: "reservation",
      startAt: booking.startAt,
      endAt: booking.endAt,
      status: "live",
      bookingId: booking.id,
      holdExpiresAt,
      createdByUid: actorUid,
      createdAt: this.now,
      releasedAt: null,
    };
    this.addedBlocks.push(block);
    this.releasedBlockIds.delete(block.id);
    this.buffer.set(this.blockRef(block.id), block);
  }

  /** Clear the hold expiry once the booking is confirmed. */
  keepReservation(bookingId: string): void {
    this.buffer.set(
      this.blockRef(ids.reservationBlock(bookingId)),
      { holdExpiresAt: null },
      { merge: true },
    );
  }

  private noteRelease(blockId: string): void {
    if (this.releasedBlockIds.has(blockId)) return;
    const block = [...this.liveBlocks, ...this.addedBlocks].find((b) => b.id === blockId);
    if (block) this.releasedIntervals.push({ startAt: block.startAt, endAt: block.endAt });
  }

  releaseReservation(bookingId: string): void {
    const id = ids.reservationBlock(bookingId);
    this.noteRelease(id);
    this.releasedBlockIds.add(id);
    this.buffer.set(this.blockRef(id), { status: "released", releasedAt: this.now }, { merge: true });
  }

  addOwnerBlock(block: AvailabilityBlockDoc): void {
    this.addedBlocks.push(block);
    this.buffer.set(this.blockRef(block.id), block);
  }

  releaseOwnerBlock(blockId: string): void {
    this.noteRelease(blockId);
    this.releasedBlockIds.add(blockId);
    this.buffer.set(this.blockRef(blockId), { status: "released", releasedAt: this.now }, { merge: true });
  }

  /** Stop new reservations until this booking's unresolved state clears. */
  hold(bookingId: string): void {
    if (!this.blockingBookingId) this.blockingBookingId = bookingId;
  }

  /** This booking no longer holds the item; another unresolved booking may still do. */
  releaseHold(bookingId: string): void {
    if (this.blockingBookingId === bookingId) {
      this.blockingBookingId = this.findBlockingBooking(null, bookingId);
    }
  }

  /** Apply remaining system transitions, rewrite the guard and flush. */
  finish(): void {
    for (const [id, due] of this.planned) {
      if (this.claimed.has(id)) continue;
      const booking = this.bookingCache.get(id);
      if (!booking) continue;
      const writer = new BookingEventWriter(booking, this.now);
      applySystemTransition(this, writer, due);
      writer.writeTo(this.buffer, this.db);
    }
    this.availabilityRevision =
      (this.guard.availabilityRevision ?? 0) + (this.releasedIntervals.length > 0 ? 1 : 0);
    const guard: CalendarControlDoc = {
      listingId: this.listingId,
      revision: (this.guard.revision ?? 0) + 1,
      availabilityRevision: this.availabilityRevision,
      blockingBookingId: this.blockingBookingId,
      itemHold: this.itemHold,
      updatedAt: this.now,
    };
    this.buffer.set(this.guardRef, guard);
    this.buffer.flush(this.tx);
  }
}

/**
 * Expiry and overdue transitions decided by server time. Used lazily by
 * commands and reads, by the guard for other bookings on the same calendar,
 * and by the sweep endpoint.
 */
export function applySystemTransition(
  scope: CalendarScope,
  writer: BookingEventWriter,
  due: SystemTransition,
): void {
  const booking = writer.booking;
  const title = booking.termsSnapshot.titleEn;
  if (due === "expired") {
    const wasHold = booking.status === "accepted";
    const seq = writer.transition(
      "expired",
      SYSTEM_ACTOR,
      wasHold ? "hold_expired" : "request_expired",
      wasHold
        ? "The hold expired before the booking was confirmed."
        : "The request expired without a decision.",
    );
    writer.set({ expiredAt: scope.now });
    if (wasHold) scope.releaseReservation(booking.id);
    for (const recipientUid of [booking.borrowerUid, booking.ownerUid]) {
      writer.notify(seq, {
        recipientUid,
        type: "booking_expired",
        title: wasHold ? "Booking hold expired" : "Booking request expired",
        body: `The ${wasHold ? "hold" : "request"} for ${title} expired. The dates are free again.`,
      });
    }
    return;
  }
  const seq = writer.transition(
    "overdue",
    SYSTEM_ACTOR,
    "overdue",
    "The return time passed without a reported return.",
  );
  writer.set({ overdueAt: scope.now });
  scope.hold(booking.id);
  writer.notify(seq, {
    recipientUid: booking.borrowerUid,
    type: "booking_overdue",
    title: "Return overdue",
    body: `${title} was due back. Please return it and report the return.`,
  });
  writer.notify(seq, {
    recipientUid: booking.ownerUid,
    type: "booking_overdue",
    title: "Item not returned yet",
    body: `${title} has passed its return time. New bookings are paused until it is back.`,
  });
}

export interface CalendarSnapshot {
  blocks: AvailabilityBlockDoc[];
  onHold: boolean;
  itemHold: ItemHold | null;
}

/** Called after a committed transaction that released dates (for availability alerts). */
export interface AvailabilityReleaseEvent {
  listingId: string;
  intervals: Interval[];
  availabilityRevision: number;
}

@Injectable()
export class CalendarGuardService {
  private readonly logger = new Logger(CalendarGuardService.name);
  private readonly releaseListeners: ((event: AvailabilityReleaseEvent) => Promise<void>)[] = [];

  constructor(private readonly firebase: FirebaseService) {}

  private get db(): Firestore {
    return this.firebase.firestore;
  }

  onAvailabilityReleased(listener: (event: AvailabilityReleaseEvent) => Promise<void>): void {
    this.releaseListeners.push(listener);
  }

  async withListingCalendar<T>(
    listingId: string,
    fn: (scope: CalendarScope) => Promise<T>,
  ): Promise<T> {
    let committed: CalendarScope | null = null;
    const result = await this.db.runTransaction(async (tx) => {
      const scope = new CalendarScope(this.db, tx, listingId, new Date().toISOString());
      await scope.load();
      const value = await fn(scope);
      scope.finish();
      committed = scope;
      return value;
    });
    // Side effects only after commit, never inside the (retriable) transaction.
    const scope = committed as CalendarScope | null;
    if (scope && scope.releasedIntervals.length > 0 && this.releaseListeners.length > 0) {
      const event: AvailabilityReleaseEvent = {
        listingId,
        intervals: [...scope.releasedIntervals],
        availabilityRevision: scope.availabilityRevision,
      };
      for (const listener of this.releaseListeners) {
        try {
          await listener(event);
        } catch (err) {
          this.logger.warn(`Availability listener failed for ${listingId}: ${(err as Error).message}`);
        }
      }
    }
    return result;
  }

  /** Owner reactivated the listing: the item is available again (no-op when there is no hold). */
  async clearItemHold(listingId: string): Promise<boolean> {
    const guard = (await this.db.collection(COLLECTIONS.calendarControls).doc(listingId).get()).data() as
      | CalendarControlDoc
      | undefined;
    if (!guard?.itemHold) return false;
    await this.withListingCalendar(listingId, async (scope) => {
      scope.clearItemHold();
    });
    return true;
  }

  /**
   * Read-only view for quotes and public availability. Expired holds are not
   * counted, and an active booking past its return time counts as a hold.
   * Commands recheck everything inside the transaction.
   */
  async snapshot(listingId: string): Promise<CalendarSnapshot> {
    const now = new Date().toISOString();
    const [guardSnap, blocksSnap] = await Promise.all([
      this.db.collection(COLLECTIONS.calendarControls).doc(listingId).get(),
      this.db
        .collection(COLLECTIONS.availabilityBlocks)
        .where("listingId", "==", listingId)
        .where("status", "==", "live")
        .get(),
    ]);
    const guard = guardSnap.exists ? (guardSnap.data() as CalendarControlDoc) : null;
    let onHold = !!guard?.blockingBookingId || !!guard?.itemHold;
    const blocks: AvailabilityBlockDoc[] = [];

    for (const doc of blocksSnap.docs) {
      const block = doc.data() as AvailabilityBlockDoc;
      const mayMatter =
        block.kind === "reservation" &&
        !!block.bookingId &&
        (isCandidateForSystemTransition(block, now) || !onHold);
      if (mayMatter) {
        const bookingSnap = await this.db.collection(COLLECTIONS.bookings).doc(block.bookingId!).get();
        const booking = bookingSnap.exists ? (bookingSnap.data() as BookingDoc) : null;
        const due = booking ? dueSystemTransition(booking, now) : null;
        if (due === "expired") continue;
        if (due === "overdue" || (booking && GUARD_BLOCKING_STATUSES.includes(booking.status))) onHold = true;
      }
      blocks.push(block);
    }
    return { blocks, onHold, itemHold: guard?.itemHold ?? null };
  }
}
