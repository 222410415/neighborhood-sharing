"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ContentContainer } from "@/components/layout/content-container";
import { PageHeading } from "@/components/layout/page-heading";
import { BookingStatusBadge } from "@/features/bookings/components/booking-status-badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-context";
import { nextStepText } from "@/features/bookings/booking-labels";
import { fetchMyBookings, runBookingCommand } from "@/features/bookings/bookings-api";
import type { BookingSummary } from "@/features/bookings/bookings-types";
import { fetchConversations, type Conversation } from "@/features/messages/messages-api";
import {
  announceNotificationsChanged,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type AppNotification,
} from "@/features/notifications/notifications-api";
import { errorText } from "@/lib/api-client";
import { formatDateTime, formatRange } from "@/lib/format";

const LIST_SIZE = 5;

const needsYou = ({ availableCommands }: BookingSummary) =>
  availableCommands.some((c) => c !== "cancel" && !c.startsWith("arrange_"));

function BookingRow({ item, onChanged }: { item: BookingSummary; onChanged: () => Promise<void> }) {
  const { booking, otherMember, role, availableCommands } = item;
  const [busy, setBusy] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canDecide = availableCommands.includes("accept") && availableCommands.includes("decline");

  const decide = async (command: "accept" | "decline") => {
    setBusy(true);
    setError(null);
    const res = await runBookingCommand(booking.id, command, booking.revision);
    if (res.error) {
      setBusy(false);
      setError(errorText(res.error, "That could not be done. Open the booking to try again."));
      return;
    }
    await onChanged();
  };

  return (
    <li>
      <div className="activity-row">
        <Link href={`/bookings/${booking.id}`} className="activity-row-link">
          <strong>{booking.termsSnapshot.titleEn}</strong>
          <span>
            {role === "owner" ? "Requested by" : "From"} {otherMember.displayName}.{" "}
            {formatRange(booking.startAt, booking.endAt)}
          </span>
          <span>{nextStepText(booking.status, role)}</span>
        </Link>
        <div className="activity-actions">
          {canDecide ? (
            confirmDecline ? (
              <>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmDecline(false)}>
                  Keep it
                </Button>
                <Button size="sm" loading={busy} onClick={() => decide("decline")}>
                  Yes, decline
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmDecline(true)}>
                  Decline
                </Button>
                <Button size="sm" loading={busy} onClick={() => decide("accept")}>
                  Accept
                </Button>
              </>
            )
          ) : (
            <BookingStatusBadge status={booking.status} />
          )}
        </div>
      </div>
      {error && (
        <div className="pb-3">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
    </li>
  );
}

export default function ActivityPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [bookings, setBookings] = useState<BookingSummary[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/sign-in?return=/activity");
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    const [borrowing, lending, chats, updates] = await Promise.all([
      fetchMyBookings("borrower"),
      fetchMyBookings("owner"),
      fetchConversations(),
      fetchNotifications(),
    ]);
    setLoading(false);
    const failed = [borrowing, lending, chats, updates].find((res) => res.error);
    setError(failed ? errorText(failed.error, "Some of your activity could not be loaded.") : null);
    setBookings([...(lending.data?.items ?? []), ...(borrowing.data?.items ?? [])]);
    setConversations(chats.data?.items ?? []);
    setNotifications(updates.data?.items ?? []);
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const openUpdate = async (notification: AppNotification) => {
    if (!notification.readAt) {
      await markNotificationRead(notification.id);
      announceNotificationsChanged();
    }
    router.push(notification.actionPath);
  };
  const markAllRead = async () => {
    await markAllNotificationsRead();
    announceNotificationsChanged();
    await load();
  };

  if (authLoading || !user) return null;

  const actions = bookings.filter(needsYou);
  const chats = [...conversations]
    .sort((a, b) => Number(b.unread) - Number(a.unread) || (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""))
    .slice(0, LIST_SIZE);
  const updates = notifications.slice(0, LIST_SIZE);
  const hasUnreadUpdates = notifications.some((n) => !n.readAt);
  const empty = !actions.length && !conversations.length && !notifications.length;

  return (
    <ContentContainer className="max-w-[1040px]">
      <PageHeading title="Activity" subtitle="What needs you, your messages and your latest updates." />
      {error && (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
      {loading ? (
        <Skeleton className="h-64 w-full !rounded-[18px]" />
      ) : empty ? (
        <EmptyState
          title="Nothing here yet"
          description="Requests, messages and updates will appear here once you borrow or lend an item."
          action={
            <Link href="/" className="primary-link">
              Explore items
            </Link>
          }
        />
      ) : (
        <div className="activity-grid">
          <section className="workspace-card" aria-labelledby="activity-needs">
            <div className="activity-head">
              <h2 id="activity-needs">Needs you</h2>
              <Link href="/bookings" className="text-button">
                All bookings
              </Link>
            </div>
            {actions.length === 0 ? (
              <p className="m-0 py-3 text-[var(--nsr-text-secondary)]">You're all caught up.</p>
            ) : (
              <ul className="activity-list">
                {actions.map((item) => (
                  <BookingRow key={item.booking.id} item={item} onChanged={load} />
                ))}
              </ul>
            )}
          </section>
          <div>
            <section className="workspace-card" aria-labelledby="activity-messages">
              <div className="activity-head">
                <h2 id="activity-messages">Messages</h2>
                <Link href="/messages" className="text-button">
                  All messages
                </Link>
              </div>
              {chats.length === 0 ? (
                <p className="m-0 py-3 text-[var(--nsr-text-secondary)]">No conversations yet.</p>
              ) : (
                <ul className="activity-list">
                  {chats.map((chat) => (
                    <li key={chat.id}>
                      <div className="activity-row">
                        <Link href={`/messages/${encodeURIComponent(chat.id)}`} className="activity-row-link">
                          <strong>{chat.otherMember.displayName}</strong>
                          <span>{chat.lastMessagePreview ?? chat.contextTitle}</span>
                        </Link>
                        {chat.unread && <span className="activity-unread" title="Unread" aria-label="Unread" />}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="workspace-card" aria-labelledby="activity-updates">
              <div className="activity-head">
                <h2 id="activity-updates">Updates</h2>
                {hasUnreadUpdates ? (
                  <button type="button" className="text-button" onClick={markAllRead}>
                    Mark all read
                  </button>
                ) : (
                  <Link href="/notifications" className="text-button">
                    All updates
                  </Link>
                )}
              </div>
              {updates.length === 0 ? (
                <p className="m-0 py-3 text-[var(--nsr-text-secondary)]">No updates yet.</p>
              ) : (
                <ul className="activity-list">
                  {updates.map((n) => (
                    <li key={n.id}>
                      <div className="activity-row">
                        <button
                          type="button"
                          className="activity-row-link border-0 bg-transparent p-0 text-left"
                          onClick={() => openUpdate(n)}
                        >
                          <strong>{n.title}</strong>
                          <span>{formatDateTime(n.createdAt)}</span>
                        </button>
                        {!n.readAt && <span className="activity-unread" title="Unread" aria-label="Unread" />}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </ContentContainer>
  );
}
