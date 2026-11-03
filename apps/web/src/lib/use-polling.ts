"use client";

import { useEffect, useRef } from "react";

/**
 * Calls `callback` every `intervalMs` while `enabled` and the page is visible.
 * Returning `false` (or throwing) counts as a failure and backs off up to 8x.
 * Polling stops when disabled (for example after sign-out) or on unmount, and
 * resumes immediately when the page becomes visible again.
 */
export function usePolling(
  callback: () => Promise<boolean | void> | boolean | void,
  intervalMs: number,
  enabled: boolean,
): void {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (delay: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(tick, delay);
    };

    async function tick() {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        try {
          const ok = await saved.current();
          failures = ok === false ? failures + 1 : 0;
        } catch {
          failures += 1;
        }
      }
      if (!stopped) schedule(Math.min(intervalMs * 2 ** failures, intervalMs * 8));
    }

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !stopped) schedule(0);
    };

    schedule(intervalMs);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [intervalMs, enabled]);
}
