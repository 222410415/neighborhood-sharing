import { cn } from "@/lib/cn";

interface AvatarInitialsProps {
  name: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-8 w-8 text-[12px]",
  md: "h-10 w-10 text-[14px]",
  lg: "h-12 w-12 text-[16px]",
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function AvatarInitials({ name, size = "md" }: AvatarInitialsProps) {
  const initials = getInitials(name);
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full",
        "bg-[var(--nsr-selected-background)] text-[var(--nsr-selected-foreground)]",
        "font-semibold",
        sizeClasses[size],
      )}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}
