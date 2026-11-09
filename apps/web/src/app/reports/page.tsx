"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ContentContainer } from "@/components/layout/content-container";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-context";
import { CATEGORY_LABELS, REPORT_OUTCOME_LABELS, fetchMyReports, type Report } from "@/features/trust/trust-api";
import { errorText } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

const STATUS: Record<Report["status"], string> = {
  open: "Waiting for a reviewer",
  in_review: "Being reviewed",
  closed: "Closed",
};

const OUTCOME = REPORT_OUTCOME_LABELS;

export default function MyReportsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<Report[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/sign-in?return=/reports");
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user) return;
    fetchMyReports().then((res) => {
      if (res.data) setItems(res.data.items);
      else setError(errorText(res.error, "Your reports could not be loaded."));
    });
  }, [user]);

  return (
    <ContentContainer>
      <PageHeading title="Your reports" subtitle="Only you and the reviewer handling a report can see it." />
      {error && <Alert variant="error">{error}</Alert>}
      {!items && !error ? (
        <Skeleton className="h-24 w-full" />
      ) : items && items.length === 0 ? (
        <div className="workspace-card">
          <EmptyState
            title="No reports"
            description="You can report a listing, a message, a review or a member from where you see it."
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items?.map((r) => (
            <li key={r.id} className="workspace-card !mb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[15px] font-semibold">
                  {CATEGORY_LABELS[r.category]} · {r.targetType}
                </p>
                <span className="text-[13px] font-semibold">{STATUS[r.status]}</span>
              </div>
              <p className="text-[13px] text-[var(--nsr-text-secondary)]">Sent {formatDateTime(r.createdAt)}</p>
              <p className="mt-1 text-[14px]">{r.description}</p>
              {r.outcome && (
                <p className="mt-2 text-[13px]">
                  <strong>Outcome:</strong> {OUTCOME[r.outcome] ?? r.outcome}
                  {r.outcomeNote ? `. ${r.outcomeNote}` : ""}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </ContentContainer>
  );
}
