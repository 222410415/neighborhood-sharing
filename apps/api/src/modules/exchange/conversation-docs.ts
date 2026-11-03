/**
 * Builders for conversation, message and message-notification documents.
 * Shared by the messaging module and by booking creation, which opens the
 * booking conversation in the same transaction as the request.
 */

import { BOOKING_CONFIG, type ConversationContextType } from "@neighborhood/contracts";
import type { ConversationDoc, MessageDoc, NotificationDoc } from "./exchange.types.js";
import { ids } from "./ids.js";

export function newConversationDoc(input: {
  contextType: ConversationContextType;
  contextId: string;
  listingId: string;
  uidA: string;
  uidB: string;
  createdByUid: string;
  now: string;
}): ConversationDoc {
  const participantUids = [input.uidA, input.uidB].sort();
  return {
    id: ids.conversation(input.contextType, input.contextId, input.uidA, input.uidB),
    contextType: input.contextType,
    contextId: input.contextId,
    listingId: input.listingId,
    participantUids,
    createdByUid: input.createdByUid,
    lastMessageAt: null,
    lastMessagePreview: null,
    lastMessageSenderUid: null,
    lastReadAt: Object.fromEntries(participantUids.map((uid) => [uid, null])),
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export function newMessageDoc(input: {
  conversationId: string;
  senderUid: string;
  body: string;
  clientMessageId: string;
  now: string;
}): MessageDoc {
  return {
    id: ids.message(input.conversationId, input.senderUid, input.clientMessageId),
    conversationId: input.conversationId,
    senderUid: input.senderUid,
    body: input.body,
    clientMessageId: input.clientMessageId,
    createdAt: input.now,
  };
}

/** Conversation fields to update after a message is sent. */
export function afterMessage(message: MessageDoc): Partial<ConversationDoc> {
  return {
    lastMessageAt: message.createdAt,
    lastMessageId: message.id,
    lastMessagePreview: message.body.slice(0, BOOKING_CONFIG.messagePreviewLength),
    lastMessageSenderUid: message.senderUid,
    lastReadAt: { [message.senderUid]: message.createdAt },
    updatedAt: message.createdAt,
  };
}

/**
 * One unread "new messages" notification per conversation and recipient,
 * refreshed rather than duplicated. The preview never contains message text.
 */
export function messageNotificationDoc(input: {
  conversationId: string;
  recipientUid: string;
  senderName: string;
  contextTitle: string;
  now: string;
}): NotificationDoc {
  return {
    id: ids.messageNotification(input.conversationId, input.recipientUid),
    recipientUid: input.recipientUid,
    type: "message_received",
    entityType: "conversation",
    entityId: input.conversationId,
    title: `New message from ${input.senderName}`,
    body: `About ${input.contextTitle}. Open the conversation to read it.`,
    actionPath: `/messages/${encodeURIComponent(input.conversationId)}`,
    createdAt: input.now,
    readAt: null,
  };
}
