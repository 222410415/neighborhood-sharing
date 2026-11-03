interface PageHeadingProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function PageHeading({ title, subtitle, action }: PageHeadingProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-8">
      <div>
        <h1 className="font-[Georgia] text-[34px] sm:text-[42px] font-normal tracking-[-0.04em] text-[var(--nsr-text)] leading-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[14px] text-[var(--nsr-text-secondary)] mt-2">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
