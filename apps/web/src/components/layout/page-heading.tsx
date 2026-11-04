interface PageHeadingProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function PageHeading({ title, subtitle, action }: PageHeadingProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="page-title">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[15px] text-[var(--nsr-text-secondary)] mt-1.5">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
