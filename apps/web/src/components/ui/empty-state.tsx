interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <p className="text-[16px] font-medium text-[var(--nsr-text)] mb-2">
        {title}
      </p>
      {description && (
        <p className="text-[14px] text-[var(--nsr-text-secondary)] max-w-md mb-6">
          {description}
        </p>
      )}
      {action && <div>{action}</div>}
    </div>
  );
}
