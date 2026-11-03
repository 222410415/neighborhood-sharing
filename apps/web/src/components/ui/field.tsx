import { cn } from "@/lib/cn";

interface FieldProps {
  label: string;
  name: string;
  type?: string;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  hasToggle?: boolean;
  multiline?: boolean;
  onChange?: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
}

export function Field({
  label,
  name,
  type = "text",
  value,
  defaultValue,
  placeholder,
  error,
  required,
  disabled,
  className,
  hasToggle,
  multiline,
  onChange,
  onBlur,
}: FieldProps) {
  const fieldId = `field-${name}`;
  const errorId = `${fieldId}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="text-[14px] font-medium text-[var(--nsr-text)]"
      >
        {label}
        {required && (
          <span className="text-[var(--nsr-error)]" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </label>
      {multiline ? (
        <textarea
          id={fieldId}
          name={name}
          value={value}
          defaultValue={defaultValue}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          onChange={onChange}
          rows={5}
          className={cn(
            "w-full p-3 text-[15px] rounded-[var(--nsr-radius-md)] bg-[var(--nsr-surface)] text-[var(--nsr-text)] border border-[var(--nsr-control-outline)] resize-y focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nsr-focus)]",
            error && "border-[var(--nsr-error)]",
            className,
          )}
        />
      ) : (
        <input
          id={fieldId}
          name={name}
          type={type}
          value={value}
          defaultValue={defaultValue}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={error ? errorId : undefined}
          onChange={onChange}
          onBlur={onBlur}
          className={cn(
            "h-11 px-3 text-[15px] rounded-[var(--nsr-radius-md)]",
            "bg-[var(--nsr-surface)] text-[var(--nsr-text)]",
            "border border-[var(--nsr-control-outline)]",
            "transition-colors duration-[var(--nsr-transition-fast)]",
            "focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nsr-focus)]",
            "disabled:bg-[var(--nsr-disabled-background)] disabled:text-[var(--nsr-disabled-foreground)] disabled:cursor-not-allowed",
            error && "border-[var(--nsr-error)]",
            hasToggle && "pr-16",
            className,
          )}
        />
      )}
      {error && (
        <p id={errorId} className="text-[13px] text-[var(--nsr-error)]">
          {error}
        </p>
      )}
    </div>
  );
}
