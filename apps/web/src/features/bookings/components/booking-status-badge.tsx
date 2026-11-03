import { cn } from "@/lib/cn";
import { STATUS_LABELS, STATUS_TONE } from "@/features/bookings/booking-labels";
import type { BookingStatus } from "@/features/bookings/bookings-types";

const toneStyles: Record<string, { bg: string; text: string }> = {
  success: { bg: "var(--nsr-success-background)", text: "var(--nsr-success)" },
  warning: { bg: "var(--nsr-warning-background)", text: "var(--nsr-warning)" },
  error: { bg: "var(--nsr-error-background)", text: "var(--nsr-error)" },
  info: { bg: "var(--nsr-info-background)", text: "var(--nsr-info)" },
  neutral: { bg: "var(--nsr-disabled-background)", text: "var(--nsr-text-secondary)" },
};

export function BookingStatusBadge({ status, className }: { status: BookingStatus; className?: string }) {
  const tone = toneStyles[STATUS_TONE[status]]!;
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-[var(--nsr-radius-sm)] text-[13px] font-medium whitespace-nowrap",
        className,
      )}
      style={{ backgroundColor: tone.bg, color: tone.text }}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

/** Visible label required on every simulated money figure. */
export function SimulatedTag() {
  return (
    <span className="inline-flex items-center rounded-full bg-[var(--nsr-warning-background)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[var(--nsr-warning)]">
      Simulated
    </span>
  );
}
