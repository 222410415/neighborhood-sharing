import { ContentContainer } from "@/components/layout/content-container";

export const dynamic = "force-dynamic";

export default function NotFound() {
  return (
    <ContentContainer>
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <h1 className="text-[28px] font-semibold text-[var(--nsr-text)] mb-2">
          Page not found
        </h1>
        <p className="text-[15px] text-[var(--nsr-text-secondary)] mb-6">
          The page you are looking for does not exist.
        </p>
        <a
          href="/"
          className="px-4 py-2 text-[14px] font-medium rounded-[var(--nsr-radius-md)] bg-[var(--nsr-primary)] text-[var(--nsr-on-primary)] hover:bg-[var(--nsr-primary-hover)] transition-colors"
        >
          Back to Explore
        </a>
      </div>
    </ContentContainer>
  );
}
