/**
 * Reminder service: pickup and return reminders as in-app notifications.
 *
 * Free hosting has no scheduler, so reminders are created lazily, like expiry
 * and overdue: when a member opens their notifications, when the badge polls
 * (at most once a minute per member), and by the optional sweep endpoint.
 * Each reminder has a fixed id per booking, kind and recipient and is written
 * with create(), so it is never sent twice. Reminders never change a booking.
 */

import { Injectable, Logger } from "@nestjs/common";
import { BOOKING_CONFIG, dueReminder, type ReminderKind } from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import { formatRiyadh } from "../../common/format.js";
import { ids } from "../exchange/ids.js";
import type { BookingDoc, NotificationDoc } from "../exchange/exchange.types.js";

const ALREADY_EXISTS = 6;
const SWEEP_LIMIT_PER_STATUS = 200;

function reminderNotifications(booking: BookingDoc, kind: ReminderKind, now: string): NotificationDoc[] {
  const title = booking.termsSnapshot.titleEn;
  const base = {
    entityType: "booking" as const,
    entityId: booking.id,
    actionPath: `/bookings/${booking.id}`,
    createdAt: now,
    readAt: null,
  };
  const make = (recipientUid: string, t: string, body: string): NotificationDoc => ({
    ...base,
    id: ids.reminderNotification(booking.id, kind, recipientUid),
    recipientUid,
    type: kind === "pickup" ? "pickup_reminder" : "return_reminder",
    title: t,
    body,
  });
  if (kind === "pickup") {
    const when = formatRiyadh(booking.startAt);
    return [
      make(booking.borrowerUid, "Pickup reminder", `Pickup for ${title} is at ${when}. Check the agreed arrangement on the booking page.`),
      make(booking.ownerUid, "Handover reminder", `${title} is due to be collected at ${when}. Record its condition at handover.`),
    ];
  }
  const when = formatRiyadh(booking.endAt);
  return [
    make(booking.borrowerUid, "Return reminder", `${title} is due back by ${when}. Record its condition when you return it.`),
    make(booking.ownerUid, "Return due soon", `${title} is due back by ${when}.`),
  ];
}

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);
  private readonly lastChecked = new Map<string, number>();

  constructor(private readonly firebase: FirebaseService) {}

  private get db() {
    return this.firebase.firestore;
  }

  /** Creates the member's due reminders. Never throws; returns how many were created. */
  async ensureForMember(uid: string, options: { throttle?: boolean } = {}): Promise<number> {
    const nowMs = Date.now();
    if (options.throttle) {
      const last = this.lastChecked.get(uid) ?? 0;
      if (nowMs - last < BOOKING_CONFIG.reminderCheckIntervalMs) return 0;
    }
    if (this.lastChecked.size > 10_000) this.lastChecked.clear();
    this.lastChecked.set(uid, nowMs);
    try {
      const bookings = this.db.collection(COLLECTIONS.bookings);
      const [asBorrower, asOwner] = await Promise.all([
        bookings.where("borrowerUid", "==", uid).get(),
        bookings.where("ownerUid", "==", uid).get(),
      ]);
      const docs = [...asBorrower.docs, ...asOwner.docs].map((d) => d.data() as BookingDoc);
      return await this.ensureFor(docs);
    } catch (err) {
      this.logger.warn(`Reminder check failed for a member: ${(err as Error).message}`);
      return 0;
    }
  }

  /** Bulk version for POST /internal/sweep. */
  async sweep(): Promise<number> {
    let created = 0;
    for (const status of ["confirmed", "active"] as const) {
      const snap = await this.db
        .collection(COLLECTIONS.bookings)
        .where("status", "==", status)
        .limit(SWEEP_LIMIT_PER_STATUS)
        .get();
      created += await this.ensureFor(snap.docs.map((d) => d.data() as BookingDoc));
    }
    return created;
  }

  private async ensureFor(bookings: BookingDoc[]): Promise<number> {
    const now = new Date().toISOString();
    const wanted = new Map<string, NotificationDoc>();
    for (const booking of bookings) {
      const kind = dueReminder(booking, now);
      if (!kind) continue;
      for (const n of reminderNotifications(booking, kind, now)) wanted.set(n.id, n);
    }
    if (wanted.size === 0) return 0;
    const collection = this.db.collection(COLLECTIONS.notifications);
    const refs = [...wanted.keys()].map((id) => collection.doc(id));
    const existing = await this.db.getAll(...refs);
    let created = 0;
    for (const snap of existing) {
      if (snap.exists) continue;
      try {
        await snap.ref.create(wanted.get(snap.id)!);
        created++;
      } catch (err) {
        // Another request created it first; that is the intended outcome.
        if ((err as { code?: number }).code !== ALREADY_EXISTS) throw err;
      }
    }
    return created;
  }
}
