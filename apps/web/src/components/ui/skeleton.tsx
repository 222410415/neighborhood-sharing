import { cn } from "@/lib/cn";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[var(--nsr-radius-md)] bg-[var(--nsr-divider)]",
        className,
      )}
    />
  );
}
