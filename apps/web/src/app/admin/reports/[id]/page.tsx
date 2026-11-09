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
  REPORT_OUTCOME_LABELS,
  SEVERITY_LABELS,
  assignReport,
  decideReport,
  fetchReportForReviewer,
  reportPhotoPath,
  type ReportDecision,
  type ReportForReviewer,
  type ReportTargetType,
} from "@/features/trust/trust-api";
import { errorText } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

const DECISION_TITLES: Record<ReportDecision, string> = {
  invalid: "Invalid report: close it",
  warn: "Low: warn the member",
  take_down: "Medium: take it down",
  suspend: "High: suspend the member",
};

const TAKE_DOWN_TEXT: Record<ReportTargetType, string> = {
  listing:
    "Remove the listing from the platform and cancel its upcoming bookings (simulated payments refunded). The owner cannot publish it again; an admin can restore it.",
  message: "Remove the message from the conversation. Both members see that an admin removed it.",
  review: "Hide the review from the profile and the rating. The rating itself is never edited.",
  member: "",
};

function decisionText(decision: ReportDecision, targetType: ReportTargetType): string {
  if (decision === "invalid") return "Nothing changes. The reporter sees your note.";
  if (decision === "warn")
    return targetType === "listing"
      ? "The owner is told about the report and what to fix. The listing stays up."
      : "The member is told about the report and what to change. Nothing is removed.";
  if (decision === "take_down") return TAKE_DOWN_TEXT[targetType];
  return "Block sign-in, pause their published listings and cancel their upcoming bookings (simulated payments refunded). Items already handed over stay open, so the other member can report an issue. An admin can lift the suspension.";
}

const CONFIRM_LABEL: Record<ReportDecision, string> = {
  invalid: "Close as invalid",
  warn: "Send the warning",
  take_down: "Confirm take-down",
  suspend: "Confirm suspension",
};

export default function AdminReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = useState<ReportForReviewer | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unassigned" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [decision, setDecision] = useState<ReportDecision | "">("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
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

  const { report, target, subject } = data;
  const serious = decision === "take_down" || decision === "suspend";

  const submit = async () => {
    setError(null);
    if (!decision || !note.trim()) {
      setError("Choose a decision and write a note.");
      return;
    }
    if (serious && !confirming) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    const res = await decideReport(id, { decision, note: note.trim() });
    setBusy(false);
    setConfirming(false);
    if (res.error) setError(errorText(res.error, "The decision could not be recorded."));
    await load();
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

        {subject && (
          <section className="workspace-card">
            <h2>Member the report is about</h2>
            <p className="text-[14px]">
              <strong>{subject.displayName}</strong>
              {subject.accountStatus === "suspended" ? " (suspended)" : ""}
            </p>
            <p className="text-[13px] text-[var(--nsr-text-secondary)]">
              Earlier upheld reports about this member: {subject.upheldReports}
            </p>
            {subject.upheldReports >= 2 && (
              <p className="mt-1 text-[13px] font-semibold text-[var(--nsr-warning)]">
                Repeated problems. Consider whether a stronger decision is needed.
              </p>
            )}
          </section>
        )}

        {report.status === "closed" ? (
          <section className="workspace-card">
            <h2>Closed</h2>
            <p className="text-[14px]">
              {report.severity ? `${SEVERITY_LABELS[report.severity]} severity. ` : ""}
              {REPORT_OUTCOME_LABELS[report.outcome ?? ""] ?? report.outcome}
              {report.outcomeNote ? `: ${report.outcomeNote}` : ""}
            </p>
            {report.decidedAt && (
              <p className="mt-1 text-[12px] text-[var(--nsr-text-secondary)]">Decided {formatDateTime(report.decidedAt)}</p>
            )}
          </section>
        ) : (
          <section className="workspace-card">
            <h2>Decide</h2>
            <p className="mb-3 text-[13px] text-[var(--nsr-text-secondary)]">
              Suggested severity for this type of report: <strong>{SEVERITY_LABELS[data.suggestedSeverity]}</strong>.
              This is only a starting point; judge the evidence.
            </p>
            <fieldset className="flex flex-col gap-2" aria-label="Decision">
              {data.allowedDecisions.map((d) => (
                <label
                  key={d}
                  className={`flex cursor-pointer gap-3 rounded-[var(--nsr-radius-md)] border p-3 ${
                    decision === d ? "border-[var(--nsr-primary)]" : "border-[var(--nsr-divider)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="decision"
                    value={d}
                    checked={decision === d}
                    onChange={() => {
                      setDecision(d);
                      setConfirming(false);
                    }}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-[14px] font-semibold">{DECISION_TITLES[d]}</span>
                    <span className="block text-[13px] text-[var(--nsr-text-secondary)]">
                      {decisionText(d, report.targetType)}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            {!target && (
              <p className="mt-2 text-[13px] text-[var(--nsr-text-secondary)]">
                The reported content no longer exists, so the report can only be closed.
              </p>
            )}
            <label className="booking-field mt-3">
              <span>
                {decision === "invalid" || !decision
                  ? "Note (shown to the reporter)"
                  : `Note to ${subject?.displayName ?? "the member"} (what happened and what to fix)`}
              </span>
              <textarea rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
            {confirming && decision && (
              <div className="mt-3">
                <Alert variant="warning">
                  {decision === "suspend"
                    ? `${subject?.displayName ?? "This member"} will be signed out and blocked, and their upcoming bookings will be cancelled. Press the button again to confirm.`
                    : "This removes the content now. Press the button again to confirm."}
                </Alert>
              </div>
            )}
            {error && (
              <div className="mt-3">
                <Alert variant="error">{error}</Alert>
              </div>
            )}
            <div className="mt-3 flex justify-end gap-2">
              {confirming && (
                <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
                  Back
                </Button>
              )}
              <Button loading={busy} onClick={submit} disabled={!decision}>
                {decision ? (confirming || !serious ? CONFIRM_LABEL[decision] : "Continue") : "Choose a decision"}
              </Button>
            </div>
          </section>
        )}
      </div>
    </ContentContainer>
  );
}
