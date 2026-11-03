import { cn } from "@/lib/cn";

type AlertVariant = "success" | "warning" | "error" | "info";

interface AlertProps {
  variant: AlertVariant;
  title?: string;
  children: React.ReactNode;
}

const variantClasses: Record<AlertVariant, string> = {
  success: "bg-[var(--nsr-success-background)] text-[var(--nsr-success)]",
  warning: "bg-[var(--nsr-warning-background)] text-[var(--nsr-warning)]",
  error: "bg-[var(--nsr-error-background)] text-[var(--nsr-error)]",
  info: "bg-[var(--nsr-info-background)] text-[var(--nsr-info)]",
};

export function Alert({ variant, title, children }: AlertProps) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-[var(--nsr-radius-md)] px-4 py-3",
        variantClasses[variant],
      )}
    >
      {title && <p className="text-[14px] font-semibold mb-1">{title}</p>}
      <div className="text-[14px]">{children}</div>
    </div>
  );
}
