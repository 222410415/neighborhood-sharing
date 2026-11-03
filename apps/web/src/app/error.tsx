"use client";

import { ContentContainer } from "@/components/layout/content-container";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ContentContainer>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h1 className="text-[28px] font-semibold text-[var(--nsr-text)] mb-2">
          Something went wrong
        </h1>
        <p className="text-[15px] text-[var(--nsr-text-secondary)] mb-6">
          Please try again. If the problem persists, refresh the page.
        </p>
        <button
          onClick={() => reset()}
          className="px-4 py-2 text-[14px] font-medium rounded-[var(--nsr-radius-md)] bg-[var(--nsr-primary)] text-[var(--nsr-on-primary)] hover:bg-[var(--nsr-primary-hover)] transition-colors"
        >
          Try again
        </button>
      </div>
    </ContentContainer>
  );
}
