/**
 * Conversation service — contextual messaging between exactly two members.
 *
 * Participants and context are derived by the server: a listing enquiry is
 * between the asking member and the listing owner; a booking conversation is
 * between the booking's owner and borrower; a request conversation is between
 * a neighbor and the member who posted the community request (the neighbor may
 * have the item at home without listing it). Anyone else gets 404.
 *
 * Polling is cheap: a poll with a cursor reads only the conversation document
 * unless a newer message exists. Messages are found by an equality filter and
 * ordered in memory (no composite index needed).
 */

import { Injectable } from "@nestjs/common";
import {
  toMillis,
  type ConversationDto,
  type CreateConversationBody,
  type MessageDto,
  type MessagesPageDto,
  type SendMessageBody,
} from "@neighborhood/contracts";
import type { DocumentReference } from "firebase-admin/firestore";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import { ConflictException, ForbiddenException, NotFoundException } from "../../common/errors/api-exceptions.js";
import type { ListingDocument } from "../listings/listing.repository.js";
import type { RequestPostDoc } from "../community/request.service.js";
import type { BookingDoc, ConversationDoc, MessageDoc, NotificationDoc } from "../exchange/exchange.types.js";
import { ids } from "../exchange/ids.js";
import { MemberDirectory } from "../exchange/member-directory.service.js";
import {
  afterMessage,
  messageNotificationDoc,
  newConversationDoc,
  newMessageDoc,
} from "../exchange/conversation-docs.js";

const LIST_LIMIT = 200;
const PAGE_LIMIT = 200;

function cursorOf(m: MessageDoc): string {
  return `${m.createdAt}|${m.id}`;
}

function compareMessages(a: MessageDoc, b: MessageDoc): number {
  const t = toMillis(a.createdAt) - toMillis(b.createdAt);
  return t !== 0 ? t : a.id.localeCompare(b.id);
}

function isAfterCursor(m: MessageDoc, cursor: string): boolean {
  const [at, id] = cursor.split("|");
  if (!at || !id) return true;
  const t = toMillis(m.createdAt) - Date.parse(at);
  return t > 0 || (t === 0 && m.id.localeCompare(id) > 0);
}

export const MESSAGE_REMOVED_TEXT = "This message was removed by an admin.";

function toMessageDto(m: MessageDoc): MessageDto {
  return {
    id: m.id,
    conversationId: m.conversationId,
    senderUid: m.senderUid,
    body: m.moderationStatus === "removed" ? MESSAGE_REMOVED_TEXT : m.body,
    clientMessageId: m.clientMessageId,
    createdAt: m.createdAt,
  };
}

@Injectable()
export class ConversationService {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly members: MemberDirectory,
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  private conversationRef(id: string): DocumentReference {
    return this.db.collection(COLLECTIONS.conversations).doc(id);
  }

  /** The conversation if the member takes part in it, otherwise 404. */
  private async getForParticipant(id: string, uid: string): Promise<ConversationDoc> {
    const snap = await this.conversationRef(id).get();
    const conversation = snap.exists ? (snap.data() as ConversationDoc) : null;
    if (!conversation || !conversation.participantUids.includes(uid)) {
      throw new NotFoundException("Conversation not found");
    }
    return conversation;
  }

  /** Item titles and in-app paths for a set of conversations. */
  private async contexts(
    conversations: ConversationDoc[],
  ): Promise<Map<string, { title: string; path: string | null }>> {
    const listingIds = [...new Set(conversations.filter((c) => c.contextType === "listing").map((c) => c.contextId))];
    const bookingIds = [...new Set(conversations.filter((c) => c.contextType === "booking").map((c) => c.contextId))];
    const requestIds = [...new Set(conversations.filter((c) => c.contextType === "request").map((c) => c.contextId))];
    const out = new Map<string, { title: string; path: string | null }>();
    if (listingIds.length > 0) {
      const snaps = await this.db.getAll(...listingIds.map((id) => this.db.collection(COLLECTIONS.listings).doc(id)));
      for (const snap of snaps) {
        const l = snap.exists ? (snap.data() as ListingDocument) : null;
        out.set(`listing:${snap.id}`, {
          title: l?.titleEn ?? "An item",
          path: l?.status === "published" ? `/items/${snap.id}` : null,
        });
      }
    }
    if (bookingIds.length > 0) {
      const snaps = await this.db.getAll(...bookingIds.map((id) => this.db.collection(COLLECTIONS.bookings).doc(id)));
      for (const snap of snaps) {
        const b = snap.exists ? (snap.data() as BookingDoc) : null;
        out.set(`booking:${snap.id}`, {
          title: b ? `${b.termsSnapshot.titleEn} (booking)` : "A booking",
          path: `/bookings/${snap.id}`,
        });
      }
    }
    if (requestIds.length > 0) {
      const snaps = await this.db.getAll(...requestIds.map((id) => this.db.collection(COLLECTIONS.requestPosts).doc(id)));
      for (const snap of snaps) {
        const r = snap.exists ? (snap.data() as RequestPostDoc) : null;
        out.set(`request:${snap.id}`, {
          title: r ? `Request: ${r.title}` : "A community request",
          path: r ? `/requests/${snap.id}` : null,
        });
      }
    }
    return out;
  }

  private async toDtos(uid: string, conversations: ConversationDoc[]): Promise<ConversationDto[]> {
    const others = conversations.map((c) => c.participantUids.find((p) => p !== uid) ?? uid);
    const [names, contexts] = await Promise.all([this.members.displayNames(others), this.contexts(conversations)]);
    return conversations.map((c, i) => {
      const otherUid = others[i]!;
      const context = contexts.get(`${c.contextType}:${c.contextId}`);
      const lastRead = c.lastReadAt?.[uid] ?? null;
      const unread =
        !!c.lastMessageAt &&
        c.lastMessageSenderUid !== uid &&
        (!lastRead || toMillis(lastRead) < toMillis(c.lastMessageAt));
      return {
        id: c.id,
        contextType: c.contextType,
        contextId: c.contextId,
        contextTitle: context?.title ?? "Conversation",
        contextPath: context?.path ?? null,
        otherMember: { uid: otherUid, displayName: names.get(otherUid) ?? "Member" },
        lastMessageAt: c.lastMessageAt,
        lastMessagePreview: c.lastMessagePreview,
        lastMessageSenderUid: c.lastMessageSenderUid,
        unread,
        createdAt: c.createdAt,
      };
    });
  }

  /** POST /me/conversations — find or create. */
  async open(uid: string, body: CreateConversationBody): Promise<ConversationDto> {
    let otherUid: string;
    let listingId: string | null;
    if (body.contextType === "request") {
      // A neighbor answers a community request directly, without listing the item.
      const snap = await this.db.collection(COLLECTIONS.requestPosts).doc(body.contextId).get();
      const request = snap.exists ? (snap.data() as RequestPostDoc) : null;
      if (!request) throw new NotFoundException("Request not found");
      if (request.authorUid === uid) throw new ForbiddenException("This is your request.");
      otherUid = request.authorUid;
      listingId = null;
      const existing = await this.conversationRef(ids.conversation("request", request.id, uid, otherUid)).get();
      const stillOpen = request.status === "open" && toMillis(request.desiredEndAt) > Date.now();
      if (!existing.exists && !stillOpen) {
        throw new ConflictException("This request is no longer open.");
      }
    } else if (body.contextType === "listing") {
      const snap = await this.db.collection(COLLECTIONS.listings).doc(body.contextId).get();
      const listing = snap.exists ? (snap.data() as ListingDocument) : null;
      if (!listing) throw new NotFoundException("Item not found");
      if (listing.ownerUid === uid) throw new ForbiddenException("This is your item.");
      otherUid = listing.ownerUid;
      listingId = listing.id;
      const existing = await this.conversationRef(ids.conversation("listing", listing.id, uid, otherUid)).get();
      if (!existing.exists && listing.status !== "published") {
        throw new NotFoundException("Item not found");
      }
    } else {
      const snap = await this.db.collection(COLLECTIONS.bookings).doc(body.contextId).get();
      const booking = snap.exists ? (snap.data() as BookingDoc) : null;
      if (!booking || (booking.ownerUid !== uid && booking.borrowerUid !== uid)) {
        throw new NotFoundException("Booking not found");
      }
      otherUid = booking.ownerUid === uid ? booking.borrowerUid : booking.ownerUid;
      listingId = booking.listingId;
    }

    const profile = await this.members.profile(uid);
    if (!profile?.completedProfile) {
      throw new ForbiddenException("Complete your profile before sending messages.");
    }

    const fresh = newConversationDoc({
      contextType: body.contextType,
      contextId: body.contextId,
      listingId,
      uidA: uid,
      uidB: otherUid,
      createdByUid: uid,
      now: new Date().toISOString(),
    });
    const ref = this.conversationRef(fresh.id);
    const conversation = await this.db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) return snap.data() as ConversationDoc;
      tx.set(ref, fresh);
      return fresh;
    });
    return (await this.toDtos(uid, [conversation]))[0]!;
  }

  /** GET /me/conversations */
  async list(uid: string): Promise<ConversationDto[]> {
    const snap = await this.db
      .collection(COLLECTIONS.conversations)
      .where("participantUids", "array-contains", uid)
      .limit(LIST_LIMIT)
      .get();
    const visible = snap.docs
      .map((d) => d.data() as ConversationDoc)
      // An enquiry or request reply with no messages yet is only shown to the member who opened it.
      .filter((c) => c.contextType === "booking" || c.lastMessageAt || c.createdByUid === uid)
      .sort(
        (a, b) => toMillis(b.lastMessageAt ?? b.createdAt) - toMillis(a.lastMessageAt ?? a.createdAt),
      );
    return this.toDtos(uid, visible);
  }

  /** GET /me/conversations/:id */
  async get(uid: string, id: string): Promise<ConversationDto> {
    const conversation = await this.getForParticipant(id, uid);
    return (await this.toDtos(uid, [conversation]))[0]!;
  }

  /** GET /me/conversations/:id/messages?after= */
  async messages(uid: string, id: string, after?: string): Promise<MessagesPageDto> {
    const conversation = await this.getForParticipant(id, uid);
    if (after) {
      // Nothing newer than the cursor: answer from the conversation document alone.
      const [at, cursorId] = after.split("|");
      const last = conversation.lastMessageAt;
      if (
        !last ||
        (at && toMillis(last) < Date.parse(at)) ||
        (at && toMillis(last) === Date.parse(at) && conversation.lastMessageId === cursorId)
      ) {
        return { items: [], cursor: after };
      }
    }
    const snap = await this.db.collection(COLLECTIONS.messages).where("conversationId", "==", id).get();
    let messages = snap.docs.map((d) => d.data() as MessageDoc).sort(compareMessages);
    messages = after ? messages.filter((m) => isAfterCursor(m, after)).slice(0, PAGE_LIMIT) : messages.slice(-PAGE_LIMIT);
    const last = messages[messages.length - 1];
    return { items: messages.map(toMessageDto), cursor: last ? cursorOf(last) : (after ?? null) };
  }

  /** POST /me/conversations/:id/messages — a repeated clientMessageId returns the same message. */
  async send(uid: string, id: string, body: SendMessageBody): Promise<MessageDto> {
    const before = await this.getForParticipant(id, uid);
    const recipientUid = before.participantUids.find((p) => p !== uid)!;
    const [senderName, contexts, recipientProfile] = await Promise.all([
      this.members.displayName(uid),
      this.contexts([before]),
      this.members.profile(recipientUid),
    ]);
    // Message notifications are optional; booking and case notices are not.
    const notifyRecipient = recipientProfile?.notificationPreferences?.messages ?? true;
    const contextTitle = contexts.get(`${before.contextType}:${before.contextId}`)?.title ?? "your conversation";

    const message = await this.db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      const ref = this.conversationRef(id);
      const snap = await tx.get(ref);
      const conversation = snap.exists ? (snap.data() as ConversationDoc) : null;
      if (!conversation || !conversation.participantUids.includes(uid)) {
        throw new NotFoundException("Conversation not found");
      }
      const draft = newMessageDoc({
        conversationId: id,
        senderUid: uid,
        body: body.body,
        clientMessageId: body.clientMessageId,
        now,
      });
      const messageRef = this.db.collection(COLLECTIONS.messages).doc(draft.id);
      const existing = await tx.get(messageRef);
      if (existing.exists) return existing.data() as MessageDoc;

      const notification: NotificationDoc = messageNotificationDoc({
        conversationId: id,
        recipientUid,
        senderName,
        contextTitle,
        now,
      });
      tx.set(messageRef, draft);
      tx.set(ref, afterMessage(draft), { merge: true });
      if (notifyRecipient) {
        tx.set(this.db.collection(COLLECTIONS.notifications).doc(notification.id), notification);
      }
      return draft;
    });
    return toMessageDto(message);
  }

  /** POST /me/conversations/:id/read — also clears this conversation's message notification. */
  async markRead(uid: string, id: string): Promise<void> {
    await this.getForParticipant(id, uid);
    const now = new Date().toISOString();
    await this.conversationRef(id).set({ lastReadAt: { [uid]: now } }, { merge: true });
    const notificationRef = this.db.collection(COLLECTIONS.notifications).doc(ids.messageNotification(id, uid));
    const snap = await notificationRef.get();
    if (snap.exists && !(snap.data() as NotificationDoc).readAt) {
      await notificationRef.update({ readAt: now });
    }
  }
}
