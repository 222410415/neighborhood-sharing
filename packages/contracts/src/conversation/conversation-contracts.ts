import { z } from "zod";
import { idSchema } from "../common/limits";
import { BOOKING_CONFIG } from "../booking/booking-config";
import { clientRequestIdSchema, type MemberSummaryDto } from "../booking/booking-contracts";

/**
 * Contextual conversations between exactly two members: a listing enquiry
 * ("Ask the owner") or a booking conversation. Participants and context are
 * derived by the server; plain text only.
 */

export const conversationContextTypeSchema = z.enum(["listing", "booking"]);

export const createConversationBodySchema = z.object({
  contextType: conversationContextTypeSchema,
  contextId: idSchema,
});

export const sendMessageBodySchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write a message")
    .max(BOOKING_CONFIG.maxMessageLength),
  clientMessageId: clientRequestIdSchema,
});

export type ConversationContextType = z.infer<typeof conversationContextTypeSchema>;
export type CreateConversationBody = z.infer<typeof createConversationBodySchema>;
export type SendMessageBody = z.infer<typeof sendMessageBodySchema>;

export interface ConversationDto {
  id: string;
  contextType: ConversationContextType;
  contextId: string;
  contextTitle: string;
  /** Page inside the app for the item or booking; null if no longer viewable. */
  contextPath: string | null;
  otherMember: MemberSummaryDto;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastMessageSenderUid: string | null;
  unread: boolean;
  createdAt: string;
}

export interface MessageDto {
  id: string;
  conversationId: string;
  senderUid: string;
  body: string;
  clientMessageId: string;
  createdAt: string;
}

export interface MessagesPageDto {
  items: MessageDto[];
  /** Pass back as `after` to receive only newer messages. */
  cursor: string | null;
}
