import { z } from "zod";

/**
 * In-app notifications. Previews are safe: they never contain a pickup
 * location, a message body or an email address.
 */

export const notificationTypeSchema = z.enum([
  "booking_requested",
  "booking_accepted",
  "booking_declined",
  "booking_confirmed",
  "booking_cancelled",
  "booking_expired",
  "arrangement_proposed",
  "arrangement_acknowledged",
  "collection_recorded",
  "collection_acknowledged",
  "collection_disagreed",
  "return_recorded",
  "return_reported",
  "booking_completed",
  "booking_overdue",
  "issue_reported",
  "message_received",
  // Sprint 3
  "review_received",
  "dispute_opened",
  "dispute_statement",
  "dispute_assigned",
  "dispute_resolved",
  "report_closed",
  "offer_received",
  "offer_selected",
  "availability_alert",
  "verification_decided",
  // Reminders (added 9 Nov 2026)
  "pickup_reminder",
  "return_reminder",
]);

export const notificationEntityTypeSchema = z.enum([
  "booking",
  "conversation",
  "dispute",
  "report",
  "request",
  "listing",
  "verification",
]);

export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type NotificationEntityType = z.infer<typeof notificationEntityTypeSchema>;

export interface NotificationDto {
  id: string;
  recipientUid: string;
  type: NotificationType;
  entityType: NotificationEntityType;
  entityId: string;
  title: string;
  body: string;
  actionPath: string;
  createdAt: string;
  readAt: string | null;
}
