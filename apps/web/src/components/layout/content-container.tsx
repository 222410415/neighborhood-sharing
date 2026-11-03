import { cn } from "@/lib/cn";

interface ContentContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function ContentContainer({
  children,
  className,
}: ContentContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto max-w-[1240px] px-4 sm:px-7 py-8 sm:py-10",
        className,
      )}
    >
      {children}
    </div>
  );
}
