"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import { addDayCount, formatDayShort, riyadhToday } from "@/lib/format";

export type CalendarDayState = "free" | "partial" | "busy" | "closed";

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const STATE_WORDS: Record<CalendarDayState, string> = {
  free: "",
  partial: ", partly booked",
  busy: ", booked",
  closed: ", not available",
};

interface RangeCalendarProps {
  start: string | null;
  end: string | null;
  onPick: (day: string) => void;
  /** Days before this are closed. Defaults to today in Riyadh. */
  minDay?: string;
  /** Days after this are closed. */
  maxDay?: string | null;
  dayState?: (day: string) => CalendarDayState;
}

/** The range after a day is clicked. A range never spans a day that cannot be booked. */
export function nextRange(
  current: { start: string | null; end: string | null },
  day: string,
  isBlocked: (day: string) => boolean = () => false,
): { start: string; end: string | null } {
  const { start, end } = current;
  if (!start || end || day < start) return { start: day, end: null };
  for (let d = start; d < day; d = addDayCount(d, 1)) {
    if (isBlocked(d)) return { start: day, end: null };
  }
  return { start, end: day };
}

function monthOf(day: string): string {
  return day.slice(0, 7);
}

function shiftMonth(month: string, by: number): string {
  const [year, index] = month.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, index - 1 + by, 1)).toISOString().slice(0, 7);
}

export function RangeCalendar({ start, end, onPick, minDay, maxDay, dayState }: RangeCalendarProps) {
  const firstDay = minDay ?? riyadhToday();
  const [month, setMonth] = useState(monthOf(start ?? firstDay));
  const first = `${month}-01`;
  const leadingBlanks = new Date(`${first}T00:00:00Z`).getUTCDay();
  const daysInMonth = Number(addDayCount(`${shiftMonth(month, 1)}-01`, -1).slice(8, 10));
  const monthLabel = new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "long", year: "numeric" }).format(
    new Date(`${first}T00:00:00Z`),
  );

  return (
    <div>
      <div className="calendar-head">
        <span className="calendar-month" aria-live="polite">
          {monthLabel}
        </span>
        <span className="calendar-nav">
          <button
            type="button"
            aria-label="Previous month"
            disabled={month <= monthOf(firstDay)}
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next month"
            disabled={!!maxDay && month >= monthOf(maxDay)}
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            <ChevronRight size={18} aria-hidden="true" />
          </button>
        </span>
      </div>
      <div className="calendar-weekdays" aria-hidden="true">
        {WEEKDAYS.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
      <div className="calendar-grid">
        {Array.from({ length: leadingBlanks }, (_, i) => (
          <span key={`blank-${i}`} />
        ))}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const day = `${month}-${String(i + 1).padStart(2, "0")}`;
          const outside = day < firstDay || (!!maxDay && day > maxDay);
          const state: CalendarDayState = outside ? "closed" : (dayState?.(day) ?? "free");
          const unavailable = state === "closed" || state === "busy";
          const selected = !unavailable && (day === start || day === end);
          const inside = !!start && !!end && day > start && day < end;
          return (
            <button
              key={day}
              type="button"
              disabled={unavailable}
              aria-pressed={selected}
              aria-label={`${formatDayShort(day)}${STATE_WORDS[state]}`}
              onClick={() => onPick(day)}
              className={cn(
                "calendar-day",
                selected && "calendar-day--selected",
                !selected && inside && !unavailable && "calendar-day--inside",
                state === "closed" && "calendar-day--closed",
                state === "busy" && "calendar-day--busy",
                state === "partial" && "calendar-day--partial",
              )}
            >
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
