"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { ContentContainer } from "@/components/layout/content-container";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-context";
import {
  announceNotificationsChanged,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/features/notifications/notifications-api";
import { errorText } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

export default function NotificationsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push("/sign-in?return=/notifications");
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    const res = await fetchNotifications();
    setLoading(false);
    if (res.data) {
      setItems(res.data.items);
      setError(null);
    } else {
      setError(errorText(res.error, "Notifications could not be loaded."));
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const open = async (n: AppNotification) => {
    if (!n.readAt) {
      await markNotificationRead(n.id);
      announceNotificationsChanged();
    }
    router.push(n.actionPath);
  };

  const readAll = async () => {
    setBusy(true);
    await markAllNotificationsRead();
    setBusy(false);
    announceNotificationsChanged();
    await load();
  };

  if (authLoading || !user || loading) {
    return (
      <ContentContainer>
        <Skeleton className="h-10 w-56 mb-6" />
        <Skeleton className="h-16 w-full mb-2" />
        <Skeleton className="h-16 w-full" />
      </ContentContainer>
    );
  }

  const unread = items.filter((n) => !n.readAt).length;

  return (
    <ContentContainer>
      <PageHeading
        title="Notifications"
        subtitle="Booking updates and new messages. Shown in the app only."
        action={
          unread > 0 ? (
            <Button variant="secondary" size="sm" loading={busy} onClick={readAll}>
              Mark all as read
            </Button>
          ) : undefined
        }
      />
      {error && (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
      {items.length === 0 ? (
        <div className="workspace-card">
          <EmptyState title="No notifications yet" description="Requests, decisions and messages will appear here." />
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => open(n)}
                className={`flex w-full items-start gap-3 rounded-[var(--nsr-radius-lg)] border px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md ${
                  n.readAt
                    ? "border-[var(--nsr-divider)] bg-[var(--nsr-surface)]"
                    : "border-[#bfe0cc] bg-[var(--nsr-selected-background)]"
                }`}
              >
                <Bell size={18} className="mt-0.5 shrink-0 text-[var(--nsr-primary)]" />
                <div className="flex-1 min-w-0">
                  <p className={`text-[14px] ${n.readAt ? "font-medium" : "font-bold"}`}>
                    {n.title}
                    {!n.readAt && <span className="sr-only"> (unread)</span>}
                  </p>
                  <p className="text-[13px] text-[var(--nsr-text-secondary)]">{n.body}</p>
                </div>
                <span className="shrink-0 text-[12px] text-[var(--nsr-text-secondary)]">{formatDateTime(n.createdAt)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </ContentContainer>
  );
}
