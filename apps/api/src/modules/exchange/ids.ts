/**
 * Deterministic document ids. Repeating a command with the same client id
 * lands on the same document, so retries cannot create duplicates even when
 * two requests race.
 */

import { createHash } from "node:crypto";

function digest(...parts: string[]): string {
  return createHash("sha256").update(parts.join("\u0000")).digest("hex").slice(0, 24);
}

export const ids = {
  booking: (borrowerUid: string, clientRequestId: string) =>
    `bkg_${digest("booking", borrowerUid, clientRequestId)}`,
  reservationBlock: (bookingId: string) => `res_${bookingId}`,
  ownerBlock: (listingId: string, ownerUid: string, clientRequestId: string) =>
    `blk_${digest("block", listingId, ownerUid, clientRequestId)}`,
  bookingEvent: (bookingId: string, sequence: number) =>
    `${bookingId}_${String(sequence).padStart(4, "0")}`,
  bookingNotification: (bookingId: string, sequence: number, recipientUid: string) =>
    `ntf_${digest("booking-notification", bookingId, String(sequence), recipientUid)}`,
  payment: (bookingId: string, component: string, operation: string) =>
    `pay_${bookingId}_${component}_${operation}`,
  conditionReport: (bookingId: string, stage: string) => `cr_${bookingId}_${stage}`,
  conversation: (contextType: string, contextId: string, uidA: string, uidB: string) => {
    const [first, second] = [uidA, uidB].sort();
    return `${contextType}_${contextId}_${first}_${second}`;
  },
  message: (conversationId: string, senderUid: string, clientMessageId: string) =>
    `msg_${digest("message", conversationId, senderUid, clientMessageId)}`,
  /** One unread message notification per conversation and recipient, refreshed in place. */
  messageNotification: (conversationId: string, recipientUid: string) =>
    `ntf_msg_${digest("message-notification", conversationId, recipientUid)}`,
  /** One reminder per booking, kind and recipient. */
  reminderNotification: (bookingId: string, kind: string, recipientUid: string) =>
    `ntf_rem_${digest("reminder", bookingId, kind, recipientUid)}`,
};
