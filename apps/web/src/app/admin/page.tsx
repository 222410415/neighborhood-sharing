"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { ContentContainer } from "@/components/layout/content-container";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-context";
import {
  CATEGORY_LABELS,
  ISSUE_LABELS,
  assignDispute,
  assignReport,
  decideVerification,
  fetchQueue,
  type QueueItem,
} from "@/features/trust/trust-api";
import { errorText } from "@/lib/api-client";
import { formatDateTime, formatSar } from "@/lib/format";

type Tab = "disputes" | "reports" | "verification";

function AdminContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const tab: Tab = (["disputes", "reports", "verification"] as const).includes(params.get("tab") as Tab)
    ? (params.get("tab") as Tab)
    : "disputes";
  const [items, setItems] = useState<QueueItem[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/sign-in?return=/admin");
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    setItems(null);
    const res = await fetchQueue(tab);
    if (res.status === 403) {
      setForbidden(true);
      return;
    }
    if (res.data) setItems(res.data.items);
    else setError(errorText(res.error, "The queue could not be loaded."));
  }, [tab]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (authLoading || !user) return <ContentContainer><Skeleton className="h-48 w-full" /></ContentContainer>;

  if (forbidden) {
    return (
      <ContentContainer>
        <div className="catalogue-state">
          <span className="catalogue-state-icon">
            <ShieldAlert size={25} />
          </span>
          <h1 className="section-title">Reviewers only</h1>
          <p>This area is for authorised reviewers. Your account does not have that role.</p>
        </div>
      </ContentContainer>
    );
  }

  const assign = async (item: QueueItem) => {
    setBusyId(item.id);
    setError(null);
    const res = tab === "disputes" ? await assignDispute(item.id) : await assignReport(item.id);
    setBusyId(null);
    if (res.error) setError(errorText(res.error, "Could not assign."));
    else router.push(tab === "disputes" ? `/admin/disputes/${item.id}` : `/admin/reports/${item.id}`);
  };

  const decide = async (item: QueueItem, decision: "verified" | "rejected") => {
    setBusyId(item.id);
    setError(null);
    const res = await decideVerification(item.id, {
      decision,
      reasonCode: decision === "verified" ? "demo_check_passed" : "demo_check_rejected",
    });
    setBusyId(null);
    if (res.error) setError(errorText(res.error, "Could not record the decision."));
    await load();
  };

  return (
    <ContentContainer>
      <PageHeading
        title="Review workspace"
        subtitle="Cases, reports and demonstration checks. Every action and every evidence read is recorded in the audit trail."
      />
      <div className="tab-row mb-5" role="tablist" aria-label="Queues">
        {(["disputes", "reports", "verification"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => router.replace(`/admin?tab=${t}`)}>
            {t === "disputes" ? "Disputes" : t === "reports" ? "Reports" : "Verification"}
          </button>
        ))}
      </div>
      {error && (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
      {!items ? (
        <Skeleton className="h-32 w-full" />
      ) : items.length === 0 ? (
        <div className="workspace-card">
          <EmptyState title="Nothing waiting" description="New items appear here when members open cases, report content or request checks." />
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id} className="workspace-card !mb-0">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold">
                    {tab === "disputes" &&
                      `${item.itemTitle} · ${ISSUE_LABELS[item.issue!]}${item.kind === "complaint" ? " (complaint)" : ""}`}
                    {tab === "reports" && `${CATEGORY_LABELS[item.category!]} · ${item.targetType}`}
                    {tab === "verification" &&
                      `${item.subjectName ?? "Member"} · ${item.type === "phone_demo" ? "Phone (demo)" : "Identity (demo)"}`}
                  </p>
                  <p className="text-[12px] text-[var(--nsr-text-secondary)]">
                    {formatDateTime(item.createdAt)} · {item.status.replace("_", " ")}
                    {tab === "disputes" && item.heldDepositHalalas
                      ? ` · simulated deposit held ${formatSar(item.heldDepositHalalas)}`
                      : ""}
                    {item.assignedToMe ? " · assigned to you" : item.assignedReviewerUid ? " · assigned to another reviewer" : ""}
                  </p>
                  {item.conflict && (
                    <p className="mt-1 text-[12px] font-semibold text-[var(--nsr-warning)]">
                      You are involved in this item, so another reviewer must handle it.
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {tab === "verification" ? (
                    !item.conflict && (
                      <>
                        <Button size="sm" loading={busyId === item.id} onClick={() => decide(item, "verified")}>
                          Mark demo check passed
                        </Button>
                        <Button size="sm" variant="secondary" loading={busyId === item.id} onClick={() => decide(item, "rejected")}>
                          Reject
                        </Button>
                      </>
                    )
                  ) : item.assignedToMe ? (
                    <Link
                      className="primary-link"
                      href={tab === "disputes" ? `/admin/disputes/${item.id}` : `/admin/reports/${item.id}`}
                    >
                      Open
                    </Link>
                  ) : (
                    !item.conflict &&
                    !item.assignedReviewerUid && (
                      <Button size="sm" loading={busyId === item.id} onClick={() => assign(item)}>
                        Assign to me
                      </Button>
                    )
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </ContentContainer>
  );
}

export default function AdminPage() {
  return (
    <Suspense fallback={<ContentContainer><Skeleton className="h-48 w-full" /></ContentContainer>}>
      <AdminContent />
    </Suspense>
  );
}
