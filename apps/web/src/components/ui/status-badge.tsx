import { cn } from "@/lib/cn";

type Status = "draft" | "published" | "paused" | "archived";

interface StatusBadgeProps {
  status: Status;
}

const statusConfig: Record<Status, { label: string; bg: string; text: string }> = {
  draft: { label: "Draft", bg: "var(--nsr-warning-background)", text: "var(--nsr-warning)" },
  published: { label: "Published", bg: "var(--nsr-success-background)", text: "var(--nsr-success)" },
  paused: { label: "Paused", bg: "var(--nsr-info-background)", text: "var(--nsr-info)" },
  archived: { label: "Archived", bg: "var(--nsr-disabled-background)", text: "var(--nsr-text-secondary)" },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-[var(--nsr-radius-sm)]",
        "text-[13px] font-medium",
      )}
      style={{ backgroundColor: config.bg, color: config.text }}
    >
      {config.label}
    </span>
  );
}
