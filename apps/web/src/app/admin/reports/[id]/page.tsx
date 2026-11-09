"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ContentContainer } from "@/components/layout/content-container";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PrivatePhoto } from "@/features/bookings/components/private-photo";
import { useAuth } from "@/features/auth/auth-context";
import {
  CATEGORY_LABELS,
  assignReport,
  closeReport,
  fetchReportForReviewer,
  hideReview,
  reportPhotoPath,
  type ReportForReviewer,
} from "@/features/trust/trust-api";
import { errorText } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

type Outcome = "no_action" | "content_hidden" | "member_warned" | "escalated_to_dispute" | "other";
const OUTCOMES: Record<Outcome, string> = {
  no_action: "No action needed",
  content_hidden: "Content hidden",
  member_warned: "Member warned",
  escalated_to_dispute: "Handled in a dispute case",
  other: "Other",
};

export default function AdminReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<ReportForReviewer | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unassigned" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | "">("");
  const [note, setNote] = useState("");
  const [hideReason, setHideReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push(`/sign-in?return=/admin/reports/${id}`);
  }, [authLoading, user, router, id]);

  const load = useCallback(async () => {
    const res = await fetchReportForReviewer(id);
    if (res.data) {
      setData(res.data);
      setState("ready");
      return;
    }
    setMessage(errorText(res.error, "The report could not be loaded."));
    setState((res.error?.details as { reason?: string } | undefined)?.reason === "not_assigned" ? "unassigned" : "error");
  }, [id]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (authLoading || state === "loading") return <ContentContainer><Skeleton className="h-64 w-full" /></ContentContainer>;

  if (state !== "ready" || !data) {
    return (
      <ContentContainer>
        <Link href="/admin?tab=reports" className="back-link">
          <ArrowLeft size={15} /> Back to the workspace
        </Link>
        <div className="max-w-2xl">
          <Alert variant={state === "unassigned" ? "info" : "error"}>{message}</Alert>
          {state === "unassigned" && (
            <Button
              className="mt-3"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                const res = await assignReport(id);
                setBusy(false);
                if (res.error) setMessage(errorText(res.error, "Could not assign the report."));
                else load();
              }}
            >
              Assign to me
            </Button>
          )}
        </div>
      </ContentContainer>
    );
  }

  const { report, target } = data;

  const close = async () => {
    setError(null);
    if (!outcome || !note.trim()) {
      setError("Choose an outcome and record your reasoning.");
      return;
    }
    setBusy(true);
    const res = await closeReport(id, { outcome, note: note.trim() });
    setBusy(false);
    if (res.error) setError(errorText(res.error, "The report could not be closed."));
    await load();
  };

  const hide = async () => {
    if (!hideReason.trim()) {
      setError("Give a reason for hiding the review.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await hideReview(report.targetId, hideReason.trim());
    setBusy(false);
    if (res.error) setError(errorText(res.error, "The review could not be hidden."));
    else setOutcome("content_hidden");
  };

  return (
    <ContentContainer>
      <div className="max-w-3xl">
        <Link href="/admin?tab=reports" className="back-link">
          <ArrowLeft size={15} /> Back to the workspace
        </Link>
        <PageHeading
          title={`${CATEGORY_LABELS[report.category]} report`}
          subtitle={`From ${data.reporterName} on ${formatDateTime(report.createdAt)}. Status: ${report.status.replace("_", " ")}.`}
        />
        <section className="workspace-card">
          <h2>What was reported</h2>
          {target ? (
            <>
              <p className="text-[14px]">
                <strong>{target.targetType}:</strong> {target.title}
                {target.targetType === "listing" && (
                  <>
                    {" "}
                    <Link href={`/items/${report.targetId}`} className="text-[var(--nsr-link)] underline">
                      open
                    </Link>
                  </>
                )}
                {target.targetType === "member" && (
                  <>
                    {" "}
                    <Link href={`/members/${report.targetId}`} className="text-[var(--nsr-link)] underline">
                      profile
                    </Link>
                  </>
                )}
              </p>
              {target.messageBody && (
                <blockquote className="mt-2 rounded-[var(--nsr-radius-md)] bg-[var(--nsr-background)] p-3 text-[14px] whitespace-pre-wrap">
                  {target.messageBody}
                </blockquote>
              )}
              {target.targetType === "review" && (
                <blockquote className="mt-2 rounded-[var(--nsr-radius-md)] bg-[var(--nsr-background)] p-3 text-[14px]">
                  {String(target.detail["rating"])}/5: {String(target.detail["comment"] ?? "")} (
                  {String(target.detail["moderationStatus"])})
                </blockquote>
              )}
              <p className="mt-2 text-[12px] text-[var(--nsr-text-secondary)]">
                Involved: {target.involved.map((m) => m.displayName).join(", ")}
              </p>
            </>
          ) : (
            <p className="text-[14px] text-[var(--nsr-text-secondary)]">The reported content no longer exists.</p>
          )}
          <h3 className="mt-4 text-[15px] font-semibold">Reporter&apos;s description</h3>
          <p className="text-[14px] whitespace-pre-wrap">{report.description}</p>
          {report.evidenceMediaIds.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {report.evidenceMediaIds.map((m, i) => (
                <PrivatePhoto key={m} apiPath={reportPhotoPath(id, m, "thumbnail")} alt={`Evidence photo ${i + 1}`} />
              ))}
            </div>
          )}
        </section>

        {report.status === "closed" ? (
          <section className="workspace-card">
            <h2>Closed</h2>
            <p className="text-[14px]">
              {OUTCOMES[report.outcome as Outcome] ?? report.outcome}: {report.outcomeNote}
            </p>
          </section>
        ) : (
          <section className="workspace-card">
            <h2>Decide</h2>
            {target?.targetType === "review" && (
              <div className="mb-4 rounded-[var(--nsr-radius-md)] border border-[var(--nsr-divider)] p-3">
                <p className="text-[13px] mb-2">Hiding removes the review from the profile and the rating. The rating itself is never edited.</p>
                <label className="booking-field">
                  <span>Reason for hiding</span>
                  <input value={hideReason} maxLength={300} onChange={(e) => setHideReason(e.target.value)} />
                </label>
                <Button className="mt-2" size="sm" variant="secondary" loading={busy} onClick={hide}>
                  Hide this review
                </Button>
              </div>
            )}
            <label className="booking-field mb-3">
              <span>Outcome</span>
              <select value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome | "")}>
                <option value="">Choose...</option>
                {(Object.keys(OUTCOMES) as Outcome[]).map((k) => (
                  <option key={k} value={k}>
                    {OUTCOMES[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="booking-field">
              <span>Note (shown to the reporter)</span>
              <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            {error && (
              <div className="mt-3">
                <Alert variant="error">{error}</Alert>
              </div>
            )}
            <div className="mt-3 flex justify-end">
              <Button loading={busy} onClick={close}>
                Close report
              </Button>
            </div>
          </section>
        )}
      </div>
    </ContentContainer>
  );
}
