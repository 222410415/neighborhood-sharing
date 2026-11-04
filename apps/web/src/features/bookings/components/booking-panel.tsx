"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, MessageCircle } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { RangeCalendar, nextRange, type CalendarDayState } from "@/components/ui/range-calendar";
import { SimulatedTag } from "@/features/bookings/components/booking-status-badge";
import { createBooking, fetchAvailability, fetchQuote } from "@/features/bookings/bookings-api";
import type { AvailabilityInfo, Quote } from "@/features/bookings/bookings-types";
import { openConversation } from "@/features/messages/messages-api";
import { errorText } from "@/lib/api-client";
import {
  formatDayRange,
  formatSar,
  isoToRiyadhDate,
  isoToRiyadhLocal,
  newClientId,
  riyadhDayStartIso,
  riyadhLocalFromNow,
  riyadhLocalToIso,
  riyadhToday,
} from "@/lib/format";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIME = "17:00";
const SAME_DAY_PICKUP = "09:00";

interface BookingPanelProps {
  listingId: string;
  listingTitle: string;
  ownerName: string;
  signedIn: boolean;
  isOwner: boolean;
  lendingMode: "free" | "paid";
  dailyRateHalalas: number;
  depositHalalas: number;
  /** Dates to prefill: a search day ("2026-11-12") or an ISO time from a request offer or alert. */
  initialFrom?: string;
  initialTo?: string;
  /** The chosen community-request offer this booking comes from. */
  requestOfferId?: string;
}

/** Splits a prefilled value into a Riyadh day and time. */
function parseInitial(value?: string): { day: string | null; time: string | null } {
  if (!value) return { day: null, time: null };
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { day: value, time: null };
  if (Number.isNaN(Date.parse(value))) return { day: null, time: null };
  const [day, time] = isoToRiyadhLocal(value).split("T") as [string, string];
  return { day, time };
}

function dayStateOf(info: AvailabilityInfo, day: string): CalendarDayState {
  const start = Date.parse(riyadhDayStartIso(day));
  const end = start + DAY_MS;
  const windowFrom = info.bookableFrom ? Date.parse(info.bookableFrom) : Infinity;
  const windowUntil = info.bookableUntil ? Date.parse(info.bookableUntil) : -Infinity;
  if (end <= windowFrom || start >= windowUntil) return "closed";
  let covered = 0;
  for (const b of info.busy) {
    const s = Math.max(start, Date.parse(b.startAt));
    const e = Math.min(end, Date.parse(b.endAt));
    if (e > s) covered += e - s;
  }
  return covered >= DAY_MS ? "busy" : covered > 0 ? "partial" : "free";
}

export function BookingPanel({
  listingId,
  listingTitle,
  ownerName,
  signedIn,
  isOwner,
  lendingMode,
  dailyRateHalalas,
  depositHalalas,
  initialFrom,
  initialTo,
  requestOfferId,
}: BookingPanelProps) {
  const router = useRouter();
  const [info, setInfo] = useState<AvailabilityInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const prefillStart = parseInitial(initialFrom);
  const prefillEnd = parseInitial(initialTo);
  const [startDay, setStartDay] = useState(prefillStart.day);
  const [endDay, setEndDay] = useState(prefillEnd.day);
  const [pickupTime, setPickupTime] = useState(prefillStart.time ?? DEFAULT_TIME);
  const [returnTime, setReturnTime] = useState(prefillEnd.time ?? DEFAULT_TIME);
  const [timesOpen, setTimesOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
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
  const pickup = startDay ? `${startDay}T${pickupTime}` : "";
  const returnAt = endDay ? `${endDay}T${returnTime}` : "";

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
      <>
        <p className="term-kicker">Your item</p>
        <p className="term-note">
          This is your listing. Neighbors request it here once you set the days it can be booked.
        </p>
        <Link className="term-action" href={`/listings/${listingId}/availability`}>
          <CalendarDays size={17} aria-hidden="true" /> Manage availability
        </Link>
        <Link className="term-action term-action--secondary" href={`/listings/${listingId}/edit`}>
          Edit your listing
        </Link>
      </>
    );
  }

  const askButton = (
    <button type="button" className="text-button" onClick={handleAsk} disabled={asking}>
      <MessageCircle size={15} className="mr-1.5 inline" aria-hidden="true" />
      {asking ? "Opening..." : "Ask the owner"}
    </button>
  );

  if (infoError) {
    return (
      <>
        <Alert variant="error">{infoError}</Alert>
        <div className="term-links">{askButton}</div>
      </>
    );
  }
  if (!info) {
    return <p className="term-note">Checking availability...</p>;
  }

  if (!info.setUp) {
    return (
      <>
        <p className="term-note">The owner has not opened booking for this item yet. You can ask them about it.</p>
        <div className="term-links">{askButton}</div>
      </>
    );
  }

  const today = riyadhToday();
  const lastDay = info.bookableUntil ? isoToRiyadhDate(new Date(Date.parse(info.bookableUntil) - 1).toISOString()) : null;
  const dayState = (day: string) => dayStateOf(info, day);

  const pickDay = (day: string) => {
    const range = nextRange({ start: startDay, end: endDay }, day, (d) => {
      const state = dayState(d);
      return state === "busy" || state === "closed";
    });
    setStartDay(range.start);
    setEndDay(range.end);
    let pickupAt = range.end === range.start ? SAME_DAY_PICKUP : DEFAULT_TIME;
    // A pickup today has to be in the future.
    const earliest = riyadhLocalFromNow(2);
    if (`${range.start}T${pickupAt}` < earliest) pickupAt = earliest.slice(11, 16);
    setPickupTime(pickupAt);
    setReturnTime(DEFAULT_TIME);
  };

  const needsApproval = quote?.confirmation === "owner_approval" || (!quote && info.bookingMode === "approval");
  const actionLabel = needsApproval ? "Request to book" : "Book now";
  const canSubmit = !!quote && quote.available && !quoting && info.acceptingRequests;
  const signInPath = `/sign-in?return=${encodeURIComponent(
    `/items/${listingId}${startDay && endDay ? `?from=${startDay}&to=${endDay}` : ""}`,
  )}`;
  const dailyPrice = lendingMode === "free" ? "Free" : `${formatSar(dailyRateHalalas)} / day`;
  const scrollToCalendar = () =>
    document.getElementById("booking-calendar")?.scrollIntoView({ behavior: "smooth", block: "center" });

  return (
    <>
      {requestOfferId && (
        <p className="term-note">From your community request: the dates are filled in. Review the quote before sending.</p>
      )}
      <div id="booking-calendar">
        <RangeCalendar
          start={startDay}
          end={endDay}
          onPick={pickDay}
          minDay={today}
          maxDay={lastDay}
          dayState={dayState}
        />
        <p className="calendar-legend">
          Crossed-out days are booked. A dot means partly booked.{" "}
          {info.bookingMode === "approval" ? "The owner reviews each request." : "Free dates are held as soon as you book."}
        </p>
      </div>
      {!info.acceptingRequests && (
        <Alert variant="warning">This item is not taking new bookings until a current exchange is closed.</Alert>
      )}

      <div className="term-summary">
        <p className="term-kicker">
          {startDay && endDay
            ? formatDayRange(startDay, endDay)
            : startDay
              ? "Now choose your return day"
              : "Choose your pickup day"}
        </p>
        {startDay && endDay && (
          <div className="term-inline">
            <span>
              {pickupTime === returnTime
                ? `Pickup and return at ${pickupTime}`
                : `Pickup ${pickupTime}, return ${returnTime}`}
              , Riyadh time
            </span>
            <button
              type="button"
              className="text-button"
              aria-expanded={timesOpen}
              onClick={() => setTimesOpen(!timesOpen)}
            >
              Change
            </button>
          </div>
        )}
        {startDay && endDay && timesOpen && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <label className="booking-field">
              <span>Pickup time</span>
              <input type="time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} />
            </label>
            <label className="booking-field">
              <span>Return time</span>
              <input type="time" value={returnTime} onChange={(e) => setReturnTime(e.target.value)} />
            </label>
          </div>
        )}
        {quoting && <p className="term-note">Calculating quote...</p>}
        {quoteError && <Alert variant="error">{quoteError}</Alert>}
        {notice && <Alert variant="warning">{notice}</Alert>}
        {quote && !quoting ? (
          <div className="flex flex-col gap-1.5" aria-live="polite">
            {!quote.available && quote.message && <Alert variant="warning">{quote.message}</Alert>}
            <div className="term-line">
              <span>
                {quote.billableDays} day{quote.billableDays === 1 ? "" : "s"}
                {quote.dailyRateHalalas > 0 ? ` at ${formatSar(quote.dailyRateHalalas)}` : ""}
              </span>
              <strong>{quote.rentalFeeHalalas === 0 ? "Free" : formatSar(quote.rentalFeeHalalas)}</strong>
            </div>
            <div className="term-line">
              <span>Refundable deposit</span>
              <strong>{formatSar(quote.depositHalalas)}</strong>
            </div>
            <div className="term-line term-line--total">
              <span className="flex items-center gap-2">
                Total <SimulatedTag />
              </span>
              <strong>{formatSar(quote.totalHalalas)}</strong>
            </div>
            <p className="term-note">
              No real money moves.
              {quote.confirmation === "owner_approval" && " You pay only after the owner accepts."}
            </p>
          </div>
        ) : (
          !quoting &&
          depositHalalas > 0 && (
            <div className="term-line">
              <span>Refundable deposit</span>
              <strong>{formatSar(depositHalalas)}</strong>
            </div>
          )
        )}
      </div>

      {submitError && <Alert variant="error">{submitError}</Alert>}
      {signedIn ? (
        <Button className="w-full" size="lg" loading={submitting} disabled={!canSubmit} onClick={handleSubmit}>
          {actionLabel}
        </Button>
      ) : (
        <Link className="term-action" href={signInPath}>
          Sign in to request this item
        </Link>
      )}

      {messageOpen && signedIn && (
        <label className="booking-field">
          <span>Message for {ownerName} (optional)</span>
          <textarea
            rows={3}
            maxLength={1000}
            value={message}
            placeholder={`Hi, I would like to borrow the ${listingTitle}.`}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
      )}
      <div className="term-links">
        {signedIn && !messageOpen && (
          <button type="button" className="text-button" onClick={() => setMessageOpen(true)}>
            Add a message
          </button>
        )}
        {askButton}
      </div>

      <div className="book-bar">
        <div className="book-bar-text">
          {quote?.available ? (
            <>
              <strong>
                {quote.rentalFeeHalalas === 0 ? "Free" : formatSar(quote.rentalFeeHalalas)}{" "}
                <small>
                  for {quote.billableDays} day{quote.billableDays === 1 ? "" : "s"}
                </small>
              </strong>
              <small>+ {formatSar(quote.depositHalalas)} deposit, simulated</small>
            </>
          ) : (
            <>
              <strong>{dailyPrice}</strong>
              <small>{depositHalalas > 0 ? `+ ${formatSar(depositHalalas)} deposit, simulated` : "No deposit"}</small>
            </>
          )}
        </div>
        {!signedIn ? (
          <Link className="term-action" href={signInPath}>
            Sign in
          </Link>
        ) : canSubmit ? (
          <button type="button" className="term-action" disabled={submitting} onClick={handleSubmit}>
            {submitting ? "Sending..." : actionLabel}
          </button>
        ) : (
          <button type="button" className="term-action" onClick={scrollToCalendar}>
            Choose dates
          </button>
        )}
      </div>
    </>
  );
}
