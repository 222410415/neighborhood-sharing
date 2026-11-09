/**
 * Notification service — in-app notifications for the signed-in member only.
 *
 * Notifications are written by booking and message transactions; this
 * service reads and marks them, and first creates any due pickup or return
 * reminders (see ReminderService). Queries use equality filters only and
 * sort bounded results in memory.
 */

import { Injectable, Logger } from "@nestjs/common";
import { toMillis, type NotificationDto } from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import { NotFoundException } from "../../common/errors/api-exceptions.js";
import type { NotificationDoc } from "../exchange/exchange.types.js";
import { ReminderService } from "./reminder.service.js";

const LIST_LIMIT = 100;

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly reminders: ReminderService,
  ) {}

  private get collection() {
    return this.firebase.firestore.collection(COLLECTIONS.notifications);
  }

  private unreadQuery(uid: string) {
    return this.collection.where("recipientUid", "==", uid).where("readAt", "==", null);
  }

  async list(uid: string): Promise<NotificationDto[]> {
    await this.reminders.ensureForMember(uid);
    const snap = await this.collection.where("recipientUid", "==", uid).get();
    return snap.docs
      .map((d) => d.data() as NotificationDoc)
      .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
      .slice(0, LIST_LIMIT);
  }

  async unreadCount(uid: string): Promise<number> {
    await this.reminders.ensureForMember(uid, { throttle: true });
    try {
      const agg = await this.unreadQuery(uid).count().get();
      return agg.data().count;
    } catch (err) {
      // Fall back to reading the documents if aggregation is unavailable.
      this.logger.warn(`count() failed, counting documents instead: ${(err as Error).message}`);
      return (await this.unreadQuery(uid).get()).size;
    }
  }

  async markRead(uid: string, id: string): Promise<NotificationDto> {
    const ref = this.collection.doc(id);
    const snap = await ref.get();
    const notification = snap.exists ? (snap.data() as NotificationDoc) : null;
    if (!notification || notification.recipientUid !== uid) {
      throw new NotFoundException("Notification not found");
    }
    if (notification.readAt) return notification;
    const readAt = new Date().toISOString();
    await ref.update({ readAt });
    return { ...notification, readAt };
  }

  async markAllRead(uid: string): Promise<{ updated: number }> {
    const snap = await this.unreadQuery(uid).get();
    const readAt = new Date().toISOString();
    let updated = 0;
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = this.firebase.firestore.batch();
      for (const doc of snap.docs.slice(i, i + 400)) {
        batch.update(doc.ref, { readAt });
        updated++;
      }
      await batch.commit();
    }
    return { updated };
  }
}
