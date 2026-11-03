"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useAuth } from "@/features/auth/auth-context";
import {
  NOTIFICATIONS_CHANGED,
  fetchUnreadCount,
} from "@/features/notifications/notifications-api";
import { usePolling } from "@/lib/use-polling";

const POLL_MS = 30_000;

/** Bell with unread count, polled every 30 seconds while signed in and visible. */
export function NotificationBell() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    const res = await fetchUnreadCount();
    if (res.data) {
      setCount(res.data.count);
      return true;
    }
    return false;
  }, []);

  useEffect(() => {
    if (!user) {
      setCount(0);
      return;
    }
    refresh();
    const onChanged = () => refresh();
    window.addEventListener(NOTIFICATIONS_CHANGED, onChanged);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, onChanged);
  }, [user, refresh]);

  usePolling(refresh, POLL_MS, !!user);

  if (!user) return null;
  const label = count > 0 ? `Notifications, ${count} unread` : "Notifications";
  return (
    <Link
      href="/notifications"
      aria-label={label}
      title={label}
      className="relative grid h-9 w-9 place-items-center rounded-full text-[#264137] hover:bg-[var(--nsr-selected-background)]"
    >
      <Bell size={19} />
      {count > 0 && (
        <span className="bell-badge" aria-hidden="true">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
