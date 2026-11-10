/** Messages API client — contextual conversations, polled with a cursor. */

import { apiFetch } from "@/lib/api-client";

export interface Conversation {
  id: string;
  contextType: "listing" | "booking" | "request";
  contextId: string;
  contextTitle: string;
  contextPath: string | null;
  otherMember: { uid: string; displayName: string };
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageSenderUid: string | null;
  unread: boolean;
  createdAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderUid: string;
  body: string;
  clientMessageId: string;
  createdAt: string;
}

const path = (id: string) => `/me/conversations/${encodeURIComponent(id)}`;

/** Find or create the conversation for an item enquiry, a booking or a community request. */
export function openConversation(contextType: "listing" | "booking" | "request", contextId: string) {
  return apiFetch<Conversation>("/me/conversations", {
    method: "POST",
    body: { contextType, contextId },
  });
}

export function fetchConversations() {
  return apiFetch<{ items: Conversation[] }>("/me/conversations");
}

export function fetchConversation(id: string) {
  return apiFetch<Conversation>(path(id));
}

export function fetchMessages(id: string, after?: string | null) {
  const query = after ? `?after=${encodeURIComponent(after)}` : "";
  return apiFetch<{ items: Message[]; cursor: string | null }>(`${path(id)}/messages${query}`);
}

export function sendMessage(id: string, body: string, clientMessageId: string) {
  return apiFetch<Message>(`${path(id)}/messages`, {
    method: "POST",
    body: { body, clientMessageId },
  });
}

export function markConversationRead(id: string) {
  return apiFetch<null>(`${path(id)}/read`, { method: "POST" });
}
