import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-[var(--nsr-primary)] text-[var(--nsr-on-primary)] hover:bg-[var(--nsr-primary-hover)] active:bg-[var(--nsr-primary-pressed)]",
  secondary:
    "bg-[var(--nsr-surface)] text-[var(--nsr-primary)] border border-[var(--nsr-control-outline)] hover:bg-[var(--nsr-selected-background)]",
  ghost:
    "bg-transparent text-[var(--nsr-text)] hover:bg-[var(--nsr-selected-background)]",
};

const sizeClasses: Record<Size, string> = {
  sm: "px-3 py-2 text-[14px] rounded-[var(--nsr-radius-sm)]",
  md: "min-h-[44px] px-5 py-2.5 text-[15px] rounded-[12px]",
  lg: "min-h-[52px] px-7 py-3 text-[16px] font-bold rounded-[var(--nsr-radius-md)]",
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium",
        "transition-colors duration-[var(--nsr-transition-fast)]",
        "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nsr-focus)]",
        "disabled:bg-[var(--nsr-disabled-background)] disabled:text-[var(--nsr-disabled-foreground)] disabled:cursor-not-allowed disabled:hover:bg-[var(--nsr-disabled-background)]",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span
          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      )}
      {children}
    </button>
  );
}
