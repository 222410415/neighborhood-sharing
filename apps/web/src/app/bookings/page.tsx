"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CalendarClock } from "lucide-react";
import { ContentContainer } from "@/components/layout/content-container";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingStatusBadge } from "@/features/bookings/components/booking-status-badge";
import { useAuth } from "@/features/auth/auth-context";
import { fetchMyBookings } from "@/features/bookings/bookings-api";
import { STATUS_LABELS, nextStepText } from "@/features/bookings/booking-labels";
import type { BookingStatus, BookingSummary } from "@/features/bookings/bookings-types";
import { errorText } from "@/lib/api-client";
import { formatRange, formatSar } from "@/lib/format";

type View = "borrowing" | "lending";

const FILTERS: (BookingStatus | "all")[] = [
  "all",
  "pending",
  "accepted",
  "confirmed",
  "active",
  "overdue",
  "return_pending",
  "disputed",
  "completed",
  "cancelled",
  "declined",
  "expired",
];

function BookingsContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const view: View = params.get("view") === "lending" ? "lending" : "borrowing";
  const [filter, setFilter] = useState<BookingStatus | "all">("all");
  const [items, setItems] = useState<BookingSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/sign-in?return=/bookings");
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchMyBookings(
      view === "lending" ? "owner" : "borrower",
      filter === "all" ? undefined : filter,
    );
    setLoading(false);
    if (res.data) setItems(res.data.items);
    else setError(errorText(res.error, "Bookings could not be loaded."));
  }, [view, filter]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (authLoading || !user) {
    return (
      <ContentContainer>
        <Skeleton className="h-10 w-56 mb-6" />
        <Skeleton className="h-24 w-full mb-2" />
        <Skeleton className="h-24 w-full" />
      </ContentContainer>
    );
  }

  const setView = (next: View) => {
    setFilter("all");
    router.replace(next === "lending" ? "/bookings?view=lending" : "/bookings");
  };

  return (
    <ContentContainer>
      <PageHeading
        title="Bookings"
        subtitle="Things you borrow and things you lend, with the next step for each."
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="tab-row" role="tablist" aria-label="Booking views">
          <button role="tab" aria-selected={view === "borrowing"} onClick={() => setView("borrowing")}>
            Borrowing
          </button>
          <button role="tab" aria-selected={view === "lending"} onClick={() => setView("lending")}>
            Lending
          </button>
        </div>
        <label className="booking-field !flex-row items-center gap-2">
          <span className="whitespace-nowrap">Status</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as BookingStatus | "all")}
            aria-label="Filter bookings by status"
          >
            {FILTERS.map((f) => (
              <option key={f} value={f}>
                {f === "all" ? "All" : STATUS_LABELS[f]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="workspace-card">
          <EmptyState
            title={view === "lending" ? "No booking requests for your items yet" : "You have not booked anything yet"}
            description={
              view === "lending"
                ? "When neighbors request your items, they appear here. Set the days your items can be booked from My listings."
                : "Find something nearby on Explore, pick your dates and send a request."
            }
            action={
              <Link href={view === "lending" ? "/my-listings" : "/"} className="header-cta">
                {view === "lending" ? "Go to My listings" : "Explore items"}
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map(({ booking, otherMember, role, availableCommands }) => {
            const needsYou = availableCommands.some((c) => c !== "cancel" && !c.startsWith("arrange_"));
            return (
              <li key={booking.id}>
                <Link
                  href={`/bookings/${booking.id}`}
                  className="flex items-center gap-4 bg-[var(--nsr-surface)] rounded-[var(--nsr-radius-lg)] border border-[var(--nsr-divider)] px-4 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                >
                  <span className="hidden sm:grid h-12 w-12 shrink-0 place-items-center rounded-[14px] bg-[#edf5ec] text-[#2b765a]">
                    <CalendarClock size={22} strokeWidth={1.6} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="text-[15px] font-semibold truncate">{booking.termsSnapshot.titleEn}</h3>
                      <BookingStatusBadge status={booking.status} />
                      {needsYou && (
                        <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--nsr-primary)]">
                          Your turn
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-[var(--nsr-text-secondary)]">
                      {role === "owner" ? "Borrower" : "Owner"}: {otherMember.displayName} ·{" "}
                      {formatRange(booking.startAt, booking.endAt)}
                    </p>
                    <p className="text-[13px] text-[var(--nsr-text-secondary)]">
                      {nextStepText(booking.status, role)}
                    </p>
                  </div>
                  <div className="hidden sm:block text-right shrink-0">
                    <p className="text-[14px] font-semibold">{formatSar(booking.termsSnapshot.totalHalalas)}</p>
                    <p className="text-[11px] text-[var(--nsr-text-secondary)]">simulated total</p>
                  </div>
                  <ArrowRight size={18} className="shrink-0 text-[var(--nsr-text-secondary)]" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </ContentContainer>
  );
}

export default function BookingsPage() {
  return (
    <Suspense fallback={<ContentContainer><Skeleton className="h-10 w-56" /></ContentContainer>}>
      <BookingsContent />
    </Suspense>
  );
}
