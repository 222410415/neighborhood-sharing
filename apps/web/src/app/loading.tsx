import { ContentContainer } from "@/components/layout/content-container";
import { Skeleton } from "@/components/ui/skeleton";

export const dynamic = "force-dynamic";

export default function Loading() {
  return (
    <ContentContainer>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="bg-[var(--nsr-surface)] rounded-[var(--nsr-radius-lg)] overflow-hidden border border-[var(--nsr-divider)]"
          >
            <Skeleton className="aspect-video rounded-none" />
            <div className="p-4 flex flex-col gap-2">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-6 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </ContentContainer>
  );
}
