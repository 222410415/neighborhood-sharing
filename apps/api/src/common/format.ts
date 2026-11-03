/** Server-side display helpers for notification text (Asia/Riyadh, SAR). */

const riyadhFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Riyadh",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatRiyadh(iso: string): string {
  return `${riyadhFormat.format(new Date(iso))} (Riyadh time)`;
}

export function formatSar(halalas: number): string {
  const sar = halalas / 100;
  return `SAR ${Number.isInteger(sar) ? sar.toFixed(0) : sar.toFixed(2)}`;
}
