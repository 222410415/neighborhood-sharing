import { cn } from "@/lib/cn";

interface SelectProps {
  label: string;
  name: string;
  value?: string;
  defaultValue?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
}

export function Select({
  label,
  name,
  value,
  defaultValue,
  error,
  required,
  disabled,
  children,
  onChange,
}: SelectProps) {
  const fieldId = `select-${name}`;
  const errorId = `${fieldId}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="text-[14px] font-medium text-[var(--nsr-text)]"
      >
        {label}
        {required && <span className="text-[var(--nsr-error)]" aria-hidden="true"> *</span>}
      </label>
      <select
        id={fieldId}
        name={name}
        value={value}
        defaultValue={defaultValue}
        required={required}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : undefined}
        onChange={onChange}
        className={cn(
          "h-11 px-3 text-[15px] rounded-[var(--nsr-radius-md)]",
          "bg-[var(--nsr-surface)] text-[var(--nsr-text)]",
          "border border-[var(--nsr-control-outline)]",
          "transition-colors duration-[var(--nsr-transition-fast)]",
          "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nsr-focus)]",
          "disabled:bg-[var(--nsr-disabled-background)] disabled:text-[var(--nsr-disabled-foreground)] disabled:cursor-not-allowed",
          error && "border-[var(--nsr-error)]",
        )}
      >
        {children}
      </select>
      {error && (
        <p id={errorId} className="text-[13px] text-[var(--nsr-error)]">
          {error}
        </p>
      )}
    </div>
  );
}
