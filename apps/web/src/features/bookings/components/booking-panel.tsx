"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, MessageCircle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SimulatedTag } from "@/features/bookings/components/booking-status-badge";
import { createBooking, fetchAvailability, fetchQuote } from "@/features/bookings/bookings-api";
import type { AvailabilityInfo, Interval, Quote } from "@/features/bookings/bookings-types";
import { openConversation } from "@/features/messages/messages-api";
import { errorText } from "@/lib/api-client";
import { cn } from "@/lib/cn";
import {
  formatDate,
  formatDateTime,
  formatSar,
  isoToRiyadhDate,
  isoToRiyadhLocal,
  newClientId,
  riyadhDayStartIso,
  riyadhLocalFromNow,
  riyadhLocalToIso,
} from "@/lib/format";

const STRIP_DAYS = 21;
const DAY_MS = 24 * 60 * 60 * 1000;

interface BookingPanelProps {
  listingId: string;
  listingTitle: string;
  signedIn: boolean;
  isOwner: boolean;
  /** ISO times to prefill (from a chosen request offer or an availability alert). */
  initialFrom?: string;
  initialTo?: string;
  /** The chosen community-request offer this booking comes from. */
  requestOfferId?: string;
}

function safeLocal(iso?: string): string {
  if (!iso || Number.isNaN(Date.parse(iso))) return "";
  return isoToRiyadhLocal(iso);
}

type DayState = "free" | "partial" | "busy" | "closed";

function dayStates(info: AvailabilityInfo): { date: string; state: DayState }[] {
  const days: { date: string; state: DayState }[] = [];
  const firstStart = new Date(riyadhDayStartIso(isoToRiyadhDate(new Date().toISOString()))).getTime();
  const windowFrom = info.bookableFrom ? Date.parse(info.bookableFrom) : Infinity;
  const windowUntil = info.bookableUntil ? Date.parse(info.bookableUntil) : -Infinity;
  for (let i = 0; i < STRIP_DAYS; i++) {
    const start = firstStart + i * DAY_MS;
    const end = start + DAY_MS;
    const date = isoToRiyadhDate(new Date(start).toISOString());
    if (end <= windowFrom || start >= windowUntil) {
      days.push({ date, state: "closed" });
      continue;
    }
    let covered = 0;
    for (const b of info.busy) {
      const s = Math.max(start, Date.parse(b.startAt));
      const e = Math.min(end, Date.parse(b.endAt));
      if (e > s) covered += e - s;
    }
    days.push({ date, state: covered >= DAY_MS ? "busy" : covered > 0 ? "partial" : "free" });
  }
  return days;
}

const DAY_STYLES: Record<DayState, string> = {
  free: "bg-[var(--nsr-success-background)] text-[var(--nsr-success)] border-[#cfe8d8]",
  partial: "bg-[var(--nsr-warning-background)] text-[var(--nsr-warning)] border-[#f1dcbc]",
  busy: "bg-[var(--nsr-error-background)] text-[var(--nsr-error)] border-[#f5d2cf]",
  closed: "bg-[var(--nsr-disabled-background)] text-[var(--nsr-disabled-foreground)] border-transparent",
};

const DAY_WORDS: Record<DayState, string> = {
  free: "free",
  partial: "partly booked",
  busy: "booked",
  closed: "not bookable",
};

function AvailabilityStrip({ info }: { info: AvailabilityInfo }) {
  const days = useMemo(() => dayStates(info), [info]);
  const upcoming: Interval[] = info.busy.slice(0, 4);
  return (
    <div>
      <div className="grid grid-cols-7 gap-1" role="list" aria-label="Availability for the next three weeks">
        {days.map((d) => {
          const label = `${formatDate(riyadhDayStartIso(d.date))}: ${DAY_WORDS[d.state]}`;
          return (
            <div
              key={d.date}
              role="listitem"
              title={label}
              aria-label={label}
              className={cn(
                "flex h-9 items-center justify-center rounded-[8px] border text-[11px] font-semibold",
                DAY_STYLES[d.state],
              )}
            >
              {Number(d.date.slice(8, 10))}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--nsr-text-secondary)]">
        <span>Green: free</span>
        <span>Amber: partly booked</span>
        <span>Red: booked</span>
        <span>Grey: not bookable</span>
      </div>
      {upcoming.length > 0 && (
        <div className="mt-3 text-[12px] text-[var(--nsr-text-secondary)]">
          <p className="font-semibold text-[var(--nsr-text)]">Busy times</p>
          <ul>
            {upcoming.map((b) => (
              <li key={`${b.startAt}-${b.endAt}`}>
                {formatDateTime(b.startAt)} to {formatDateTime(b.endAt)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function BookingPanel({
  listingId,
  listingTitle,
  signedIn,
  isOwner,
  initialFrom,
  initialTo,
  requestOfferId,
}: BookingPanelProps) {
  const router = useRouter();
  const [info, setInfo] = useState<AvailabilityInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [pickup, setPickup] = useState(safeLocal(initialFrom));
  const [returnAt, setReturnAt] = useState(safeLocal(initialTo));
  const [message, setMessage] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const requestIds = useRef(new Map<string, string>());
  const quoteSeq = useRef(0);

  useEffect(() => {
    let active = true;
    fetchAvailability(listingId).then((res) => {
      if (!active) return;
      if (res.data) setInfo(res.data);
      else setInfoError(errorText(res.error, "Availability could not be loaded."));
    });
    return () => {
      active = false;
    };
  }, [listingId]);

  const runQuote = useCallback(async () => {
    if (!pickup || !returnAt) {
      setQuote(null);
      return;
    }
    const seq = ++quoteSeq.current;
    setQuoting(true);
    setQuoteError(null);
    const res = await fetchQuote(listingId, riyadhLocalToIso(pickup), riyadhLocalToIso(returnAt));
    if (seq !== quoteSeq.current) return;
    setQuoting(false);
    if (res.data) setQuote(res.data);
    else {
      setQuote(null);
      setQuoteError(errorText(res.error, "The quote could not be calculated."));
    }
  }, [listingId, pickup, returnAt]);

  useEffect(() => {
    const timer = setTimeout(runQuote, 350);
    return () => clearTimeout(timer);
  }, [runQuote]);

  const handleAsk = async () => {
    if (!signedIn) {
      router.push(`/sign-in?return=/items/${listingId}`);
      return;
    }
    setAsking(true);
    const res = await openConversation("listing", listingId);
    setAsking(false);
    if (res.data) router.push(`/messages/${encodeURIComponent(res.data.id)}`);
    else setSubmitError(errorText(res.error, "The conversation could not be opened."));
  };

  const handleSubmit = async () => {
    if (!quote || !quote.available) return;
    setSubmitError(null);
    setNotice(null);
    setSubmitting(true);
    const key = `${quote.startAt}|${quote.endAt}`;
    const clientRequestId = requestIds.current.get(key) ?? newClientId("booking");
    requestIds.current.set(key, clientRequestId);
    const res = await createBooking({
      listingId,
      startAt: quote.startAt,
      endAt: quote.endAt,
      quoteFingerprint: quote.quoteFingerprint,
      message: message.trim() || undefined,
      clientRequestId,
      requestOfferId,
    });
    setSubmitting(false);
    if (res.data) {
      router.push(`/bookings/${res.data.id}`);
      return;
    }
    const details = res.error?.details as { reason?: string; quote?: Quote } | undefined;
    if (res.status === 409 && details?.reason === "quote_changed" && details.quote) {
      setQuote(details.quote);
      setNotice("The owner changed this item's terms. Review the updated quote below, then send again.");
      return;
    }
    if (res.status === 409 && details?.quote) setQuote(details.quote);
    setSubmitError(errorText(res.error, "The request could not be sent."));
  };

  if (isOwner) {
    return (
      <div className="booking-panel">
        <p className="term-kicker">Your item</p>
        <p className="text-[13px] text-[var(--nsr-text-secondary)]">
          This is your listing. Neighbors request it here once you set the days it can be booked.
        </p>
        <Link className="term-action" href={`/listings/${listingId}/availability`}>
          <CalendarDays size={16} className="mr-2" /> Manage availability
        </Link>
        <Link className="term-action term-action--secondary" href={`/listings/${listingId}/edit`}>
          Edit your listing
        </Link>
      </div>
    );
  }

  const askButton = (
    <button type="button" className="term-action term-action--secondary" onClick={handleAsk} disabled={asking}>
      <MessageCircle size={16} className="mr-2" /> {asking ? "Opening..." : "Ask the owner"}
    </button>
  );

  if (infoError) {
    return (
      <div className="booking-panel">
        <Alert variant="error">{infoError}</Alert>
        {askButton}
      </div>
    );
  }
  if (!info) {
    return (
      <div className="booking-panel">
        <p className="text-[13px] text-[var(--nsr-text-secondary)]">Checking availability...</p>
      </div>
    );
  }

  if (!info.setUp) {
    return (
      <div className="booking-panel">
        <p className="term-kicker">Book this item</p>
        <p className="text-[13px] text-[var(--nsr-text-secondary)]">
          The owner has not opened booking for this item yet. You can ask them about it.
        </p>
        {askButton}
      </div>
    );
  }

  const minLocal = riyadhLocalFromNow(1);
  const actionLabel =
    quote?.confirmation === "owner_approval" || (!quote && info.bookingMode === "approval")
      ? "Request to book"
      : "Book now";

  return (
    <div className="booking-panel">
      <p className="term-kicker">Book this item</p>
      {requestOfferId && (
        <p className="mb-2 text-[12px] font-semibold text-[var(--nsr-primary)]">
          From your community request: the dates are filled in. Review the quote before sending.
        </p>
      )}
      <p className="mb-3 text-[12px] text-[var(--nsr-text-secondary)]">
        {info.bookingMode === "approval"
          ? "The owner reviews each request."
          : "Instant booking: free dates are held as soon as you book."}{" "}
        Bookable {formatDate(info.bookableFrom)} to {formatDate(new Date(Date.parse(info.bookableUntil!) - 1).toISOString())}.
      </p>
      <AvailabilityStrip info={info} />
      {!info.acceptingRequests && (
        <div className="mt-3">
          <Alert variant="warning">This item is not taking new bookings until a current exchange is closed.</Alert>
        </div>
      )}

      {!signedIn ? (
        <>
          <Link className="term-action" href={`/sign-in?return=/items/${listingId}`}>
            Sign in to request this item
          </Link>
          {askButton}
        </>
      ) : (
        <>
          <div className="mt-4 flex flex-col gap-3">
            <label className="booking-field">
              <span>Pickup (Riyadh time)</span>
              <input
                type="datetime-local"
                value={pickup}
                min={minLocal}
                onChange={(e) => setPickup(e.target.value)}
              />
            </label>
            <label className="booking-field">
              <span>Return (Riyadh time)</span>
              <input
                type="datetime-local"
                value={returnAt}
                min={pickup || minLocal}
                onChange={(e) => setReturnAt(e.target.value)}
              />
            </label>
          </div>

          {quoting && <p className="mt-3 text-[12px] text-[var(--nsr-text-secondary)]">Calculating quote...</p>}
          {quoteError && (
            <div className="mt-3">
              <Alert variant="error">{quoteError}</Alert>
            </div>
          )}
          {notice && (
            <div className="mt-3">
              <Alert variant="warning">{notice}</Alert>
            </div>
          )}
          {quote && !quoting && (
            <div className="mt-4" aria-live="polite">
              {!quote.available && quote.message && <Alert variant="warning">{quote.message}</Alert>}
              <div className="term-divider !my-4" />
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold">Quote</p>
                <SimulatedTag />
              </div>
              <div className="term-line">
                <span>
                  Rental fee ({quote.billableDays} day{quote.billableDays === 1 ? "" : "s"}
                  {quote.dailyRateHalalas > 0 ? ` x ${formatSar(quote.dailyRateHalalas)}` : ""})
                </span>
                <strong>{quote.rentalFeeHalalas === 0 ? "Free" : formatSar(quote.rentalFeeHalalas)}</strong>
              </div>
              <div className="term-line">
                <span>Refundable deposit</span>
                <strong>{formatSar(quote.depositHalalas)}</strong>
              </div>
              <div className="term-line">
                <span>Total at confirmation</span>
                <strong>{formatSar(quote.totalHalalas)}</strong>
              </div>
              <p className="term-note !mt-2">
                Simulated payment: no real money moves and no card details are asked. The deposit is shown separately
                and released after the owner confirms the return.
                {quote.confirmation === "owner_approval" && " You pay only after the owner accepts."}
              </p>
              <p className="text-[11px] text-[var(--nsr-text-secondary)]">
                {isoToRiyadhLocal(quote.startAt).replace("T", " ")} to {isoToRiyadhLocal(quote.endAt).replace("T", " ")}{" "}
                Riyadh time
              </p>
            </div>
          )}

          <label className="booking-field mt-4">
            <span>Message to the owner (optional)</span>
            <textarea
              rows={3}
              maxLength={1000}
              value={message}
              placeholder={`Hi, I would like to borrow the ${listingTitle}.`}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>

          {submitError && (
            <div className="mt-3">
              <Alert variant="error">{submitError}</Alert>
            </div>
          )}
          <Button
            className="mt-4 w-full"
            size="lg"
            loading={submitting}
            disabled={!quote || !quote.available || quoting || !info.acceptingRequests}
            onClick={handleSubmit}
          >
            {actionLabel}
          </Button>
          {askButton}
        </>
      )}
    </div>
  );
}
