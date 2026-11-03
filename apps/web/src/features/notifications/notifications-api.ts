/** Notifications API client — in-app only. */

import { apiFetch } from "@/lib/api-client";

export interface AppNotification {
  id: string;
  type: string;
  entityType: "booking" | "conversation";
  entityId: string;
  title: string;
  body: string;
  actionPath: string;
  createdAt: string;
  readAt: string | null;
}

/** Fired after something marks notifications read, so the bell can refresh. */
export const NOTIFICATIONS_CHANGED = "neighborhood:notifications-changed";

export function announceNotificationsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
}

export function fetchNotifications() {
  return apiFetch<{ items: AppNotification[] }>("/me/notifications");
}

export function fetchUnreadCount() {
  return apiFetch<{ count: number }>("/me/notifications/unread-count");
}

export function markNotificationRead(id: string) {
  return apiFetch<AppNotification>(`/me/notifications/${encodeURIComponent(id)}/read`, { method: "POST" });
}

export function markAllNotificationsRead() {
  return apiFetch<{ updated: number }>("/me/notifications/read-all", { method: "POST" });
}
