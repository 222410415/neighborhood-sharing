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
  SEVERITY_LABELS,
  assignDispute,
  assignReport,
  decideVerification,
  fetchModeration,
  fetchQueue,
  reinstateMember,
  restoreListing,
  type ModerationOverview,
  type QueueItem,
} from "@/features/trust/trust-api";
import { errorText, type ApiError } from "@/lib/api-client";
import { formatDateTime, formatSar } from "@/lib/format";

type Tab = "disputes" | "reports" | "verification" | "moderation";
type QueueTab = Exclude<Tab, "moderation">;

/** Suspended members and removed listings, with the way back. */
function ModerationPanel() {
  const [data, setData] = useState<ModerationOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetchModeration();
    if (res.data) setData(res.data);
    else setError(errorText(res.error, "The moderation list could not be loaded."));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (key: string, run: (reason: string) => Promise<{ error: ApiError | null }>, done: string) => {
    const reason = (reasons[key] ?? "").trim();
    setError(null);
    setNotice(null);
    if (!reason) {
      setError("Give a reason first. It is sent to the member and kept in the audit trail.");
      return;
    }
    setBusyId(key);
    const res = await run(reason);
    setBusyId(null);
    if (res.error) setError(errorText(res.error, "That did not work."));
    else setNotice(done);
    await load();
  };

  const reasonField = (key: string) => (
    <label className="booking-field mt-2">
      <span>Reason</span>
      <input
        value={reasons[key] ?? ""}
        maxLength={500}
        onChange={(e) => setReasons((r) => ({ ...r, [key]: e.target.value }))}
      />
    </label>
  );

  if (!data) return error ? <Alert variant="error">{error}</Alert> : <Skeleton className="h-32 w-full" />;

  return (
    <div className="flex flex-col gap-4">
      {error && <Alert variant="error">{error}</Alert>}
      {notice && <Alert variant="success">{notice}</Alert>}
      <section className="workspace-card">
        <h2>Suspended members</h2>
        {data.suspendedMembers.length === 0 ? (
          <p className="text-[14px] text-[var(--nsr-text-secondary)]">No member is suspended.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.suspendedMembers.map((m) => (
              <li key={m.uid} className="border-t border-[var(--nsr-divider)] pt-3 first:border-0 first:pt-0">
                <p className="text-[15px] font-semibold">{m.displayName}</p>
                <p className="text-[12px] text-[var(--nsr-text-secondary)]">
                  {m.suspendedAt ? `Suspended ${formatDateTime(m.suspendedAt)}` : "Suspended"}
                  {m.reason ? ` · ${m.reason}` : ""}
                </p>
                {reasonField(`m:${m.uid}`)}
                <Button
                  className="mt-2"
                  size="sm"
                  loading={busyId === `m:${m.uid}`}
                  onClick={() =>
                    act(`m:${m.uid}`, (r) => reinstateMember(m.uid, r), `${m.displayName} can sign in again.`)
                  }
                >
                  Lift suspension
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="workspace-card">
        <h2>Removed listings</h2>
        {data.removedListings.length === 0 ? (
          <p className="text-[14px] text-[var(--nsr-text-secondary)]">No listing is removed.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.removedListings.map((l) => (
              <li key={l.id} className="border-t border-[var(--nsr-divider)] pt-3 first:border-0 first:pt-0">
                <p className="text-[15px] font-semibold">
                  {l.titleEn} <span className="font-normal text-[var(--nsr-text-secondary)]">by {l.ownerName}</span>
                </p>
                <p className="text-[12px] text-[var(--nsr-text-secondary)]">
                  {l.removedAt ? `Removed ${formatDateTime(l.removedAt)}` : "Removed"}
                  {l.reason ? ` · ${l.reason}` : ""}
                </p>
                {reasonField(`l:${l.id}`)}
                <Button
                  className="mt-2"
                  size="sm"
                  loading={busyId === `l:${l.id}`}
                  onClick={() =>
                    act(`l:${l.id}`, (r) => restoreListing(l.id, r), `${l.titleEn} is restored as paused. The owner can publish it again.`)
                  }
                >
                  Restore listing
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AdminContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const tab: Tab = (["disputes", "reports", "verification", "moderation"] as const).includes(params.get("tab") as Tab)
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
    if (tab === "moderation") return;
    const res = await fetchQueue(tab as QueueTab);
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
          <h1 className="section-title">Admins only</h1>
          <p>This area is for admins. Your account does not have that role.</p>
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
        title="Admin workspace"
        subtitle="Cases, reports and demonstration checks. Every action and every evidence read is recorded in the audit trail."
      />
      <div className="tab-row mb-5" role="tablist" aria-label="Queues">
        {(["disputes", "reports", "verification"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => router.replace(`/admin?tab=${t}`)}>
            {t === "disputes" ? "Disputes" : t === "reports" ? "Reports" : "Verification"}
          </button>
        ))}
        <button role="tab" aria-selected={tab === "moderation"} onClick={() => router.replace("/admin?tab=moderation")}>
          Moderation
        </button>
      </div>
      {error && (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
      {tab === "moderation" ? (
        <ModerationPanel />
      ) : !items ? (
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
                    {tab === "reports" &&
                      `${CATEGORY_LABELS[item.category!]} · ${item.targetType}${
                        item.suggestedSeverity ? ` · suggested ${SEVERITY_LABELS[item.suggestedSeverity].toLowerCase()} severity` : ""
                      }`}
                    {tab === "verification" &&
                      `${item.subjectName ?? "Member"} · ${item.type === "phone_demo" ? "Phone (demo)" : "Identity (demo)"}`}
                  </p>
                  <p className="text-[12px] text-[var(--nsr-text-secondary)]">
                    {formatDateTime(item.createdAt)} · {item.status.replace("_", " ")}
                    {tab === "disputes" && item.heldDepositHalalas
                      ? ` · simulated deposit held ${formatSar(item.heldDepositHalalas)}`
                      : ""}
                    {item.assignedToMe ? " · assigned to you" : item.assignedReviewerUid ? " · assigned to another admin" : ""}
                  </p>
                  {item.conflict && (
                    <p className="mt-1 text-[12px] font-semibold text-[var(--nsr-warning)]">
                      You are involved in this item, so another admin must handle it.
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
