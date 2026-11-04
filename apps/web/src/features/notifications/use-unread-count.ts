"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/features/auth/auth-context";
import {
  NOTIFICATIONS_CHANGED,
  fetchUnreadCount,
} from "@/features/notifications/notifications-api";
import { usePolling } from "@/lib/use-polling";

const POLL_MS = 30_000;

/** Unread notification count, polled every 30 seconds while signed in and visible. */
export function useUnreadCount(): number {
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
  return count;
}
