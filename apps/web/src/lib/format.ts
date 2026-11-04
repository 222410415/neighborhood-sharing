/**
 * Display helpers. Money is stored as integer halalas and shown as SAR.
 * Times are stored as UTC ISO strings and shown in Asia/Riyadh (UTC+03:00,
 * no daylight saving). Date inputs are interpreted as Riyadh time.
 */

export const RIYADH_TZ = "Asia/Riyadh";
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function formatSar(halalas: number): string {
  const sar = halalas / 100;
  return `SAR ${Number.isInteger(sar) ? sar.toFixed(0) : sar.toFixed(2)}`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: RIYADH_TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: RIYADH_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function formatRange(startIso: string, endIso: string): string {
  return `${formatDateTime(startIso)} to ${formatDateTime(endIso)}`;
}

/** "2026-11-10T09:00" typed in a datetime-local input (Riyadh) → UTC ISO. */
export function riyadhLocalToIso(local: string): string {
  const withSeconds = local.length === 16 ? `${local}:00` : local;
  return new Date(`${withSeconds}+03:00`).toISOString();
}

/** UTC ISO → "2026-11-10T09:00" for a datetime-local input (Riyadh). */
export function isoToRiyadhLocal(iso: string): string {
  return new Date(new Date(iso).getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 16);
}

/** "2026-11-10" (Riyadh day) → that day's start as UTC ISO. */
export function riyadhDayStartIso(date: string): string {
  return new Date(`${date}T00:00:00+03:00`).toISOString();
}

/** "2026-11-10" (Riyadh day) → the next day's start, so the whole day is included. */
export function riyadhDayEndIso(date: string): string {
  return new Date(new Date(`${date}T00:00:00+03:00`).getTime() + DAY_MS).toISOString();
}

/** UTC ISO → Riyadh calendar day "YYYY-MM-DD". */
export function isoToRiyadhDate(iso: string): string {
  return new Date(new Date(iso).getTime() + RIYADH_OFFSET_MS).toISOString().slice(0, 10);
}

/** Last Riyadh day included by an exclusive end time. */
export function exclusiveEndToRiyadhDate(iso: string): string {
  return isoToRiyadhDate(new Date(new Date(iso).getTime() - 1).toISOString());
}

/** Riyadh-local value for "now + hours", rounded to the hour, for input defaults. */
export function riyadhLocalFromNow(hours: number): string {
  const d = new Date(Date.now() + hours * 60 * 60 * 1000);
  d.setUTCMinutes(0, 0, 0);
  return isoToRiyadhLocal(d.toISOString());
}

/** Id that makes a create command safe to retry. */
export function newClientId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${random}`;
}

/** Today's date in Riyadh as "2026-11-04". */
export function riyadhToday(): string {
  return isoToRiyadhDate(new Date().toISOString());
}

/** Calendar arithmetic on "2026-11-04" dates. */
export function addDayCount(day: string, count: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10);
}

function dayParts(day: string): { weekday: string; date: number; month: string } {
  const utc = new Date(`${day}T00:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "short" }).format(utc),
    date: utc.getUTCDate(),
    month: new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", month: "short" }).format(utc),
  };
}

/** "Thu 12 Nov" */
export function formatDayShort(day: string): string {
  const { weekday, date, month } = dayParts(day);
  return `${weekday} ${date} ${month}`;
}

/** "Thu 12 to Sat 14 Nov", or "Mon 30 Nov to Tue 1 Dec" across months. */
export function formatDayRange(start: string, end: string): string {
  if (start === end) return formatDayShort(start);
  const a = dayParts(start);
  const b = dayParts(end);
  const first = a.month === b.month ? `${a.weekday} ${a.date}` : formatDayShort(start);
  return `${first} to ${b.weekday} ${b.date} ${b.month}`;
}
