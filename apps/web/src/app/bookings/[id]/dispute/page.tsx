"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Scale } from "lucide-react";
import { ContentContainer } from "@/components/layout/content-container";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SimulatedTag } from "@/features/bookings/components/booking-status-badge";
import { ConditionSummary } from "@/features/bookings/components/condition-summary";
import { useAuth } from "@/features/auth/auth-context";
import { fetchBooking } from "@/features/bookings/bookings-api";
import type { BookingDetail } from "@/features/bookings/bookings-types";
import {
  ISSUE_LABELS,
  OUTCOME_LABELS,
  addDisputeStatement,
  fetchDispute,
  openDispute,
  type Dispute,
  type DisputeIssue,
} from "@/features/trust/trust-api";
import { errorText } from "@/lib/api-client";
import { formatDateTime, formatSar } from "@/lib/format";

const STATUS_TEXT: Record<Dispute["status"], string> = {
  open: "Waiting for a reviewer",
  in_review: "A reviewer is looking at the case",
  resolved: "Resolved",
};

export default function DisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [dispute, setDispute] = useState<Dispute | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [issue, setIssue] = useState<DisputeIssue | "">("");
  const [description, setDescription] = useState("");
  const [statement, setStatement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push(`/sign-in?return=/bookings/${id}/dispute`);
  }, [authLoading, user, router, id]);

  const load = useCallback(async () => {
    const res = await fetchBooking(id);
    if (!res.data) {
      setLoadError(res.status === 404 ? "This booking does not exist or you are not part of it." : errorText(res.error, "The booking could not be loaded."));
      return;
    }
    setDetail(res.data);
    if (res.data.disputeId) {
      const d = await fetchDispute(res.data.disputeId);
      setDispute(d.data);
    } else {
      setDispute(null);
    }
  }, [id]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (authLoading || (!detail && !loadError)) {
    return (
      <ContentContainer>
        <Skeleton className="h-64 w-full max-w-3xl mx-auto" />
      </ContentContainer>
    );
  }
  if (!detail) {
    return (
      <ContentContainer>
        <div className="max-w-3xl mx-auto">
          <Alert variant="error">{loadError}</Alert>
        </div>
      </ContentContainer>
    );
  }

  const nameOf = (uid: string) => (uid === user?.uid ? "You" : detail.otherMember.displayName);
  const reports = [...detail.conditionHistory, detail.conditionReports.collection, detail.conditionReports.return]
    .filter((r): r is NonNullable<typeof r> => !!r)
    .filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i);

  const submitOpen = async () => {
    setError(null);
    if (!issue || !description.trim()) {
      setError("Choose the issue and describe what happened.");
      return;
    }
    setBusy(true);
    const res = await openDispute(id, {
      expectedRevision: detail.booking.revision,
      issue,
      description: description.trim(),
    });
    setBusy(false);
    if (res.error) setError(errorText(res.error, "The case could not be opened."));
    await load();
  };

  const submitStatement = async () => {
    if (!dispute || !statement.trim()) return;
    setBusy(true);
    setError(null);
    const res = await addDisputeStatement(dispute.id, statement.trim());
    setBusy(false);
    if (res.data) {
      setDispute(res.data);
      setStatement("");
    } else setError(errorText(res.error, "Your statement could not be added."));
  };

  return (
    <ContentContainer>
      <div className="max-w-3xl mx-auto">
        <Link href={`/bookings/${id}`} className="back-link">
          <ArrowLeft size={15} /> Back to booking
        </Link>
        <PageHeading
          title={dispute ? "Case about this exchange" : "Report a problem with this exchange"}
          subtitle={detail.booking.termsSnapshot.titleEn}
        />

        {!dispute && !detail.canOpenDispute && (
          <Alert variant="info">
            A case can be opened while the item is in use, overdue or waiting for the owner&apos;s receipt, or within 14
            days after the exchange is completed. For other problems, use Report on the listing, message or profile.
          </Alert>
        )}

        {!dispute && detail.canOpenDispute && (
          <section className="workspace-card">
            <p className="text-[14px] mb-3">
              {detail.booking.status === "completed"
                ? "The exchange is completed, so this is recorded as a complaint. The booking and its payments do not change."
                : "The booking moves to review, new bookings of the item pause, and the simulated deposit stays on hold until a reviewer decides."}
            </p>
            <label className="booking-field mb-3">
              <span>What is the issue?</span>
              <select value={issue} onChange={(e) => setIssue(e.target.value as DisputeIssue | "")}>
                <option value="">Choose...</option>
                {(Object.keys(ISSUE_LABELS) as DisputeIssue[]).map((k) => (
                  <option key={k} value={k}>
                    {ISSUE_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
            <label className="booking-field mb-3">
              <span>Describe what happened</span>
              <textarea rows={5} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <p className="text-[12px] text-[var(--nsr-text-secondary)] mb-3">
              Your description is shared with {detail.otherMember.displayName} and the reviewer. The condition records
              of this booking are attached automatically.
            </p>
            {error && (
              <div className="mb-3">
                <Alert variant="error">{error}</Alert>
              </div>
            )}
            <div className="flex justify-end">
              <Button loading={busy} onClick={submitOpen}>
                Open case
              </Button>
            </div>
          </section>
        )}

        {dispute && (
          <>
            <section className="workspace-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="!mb-0 inline-flex items-center gap-2">
                  <Scale size={18} /> {ISSUE_LABELS[dispute.issue]}
                  {dispute.kind === "complaint" ? " (complaint after completion)" : ""}
                </h2>
                <span className="text-[13px] font-semibold">{STATUS_TEXT[dispute.status]}</span>
              </div>
              <p className="mt-2 text-[13px] text-[var(--nsr-text-secondary)]">
                Opened by {nameOf(dispute.openedByUid)} on {formatDateTime(dispute.createdAt)}
              </p>
              <p className="mt-2 text-[14px] whitespace-pre-wrap">{dispute.description}</p>
              {dispute.kind === "exchange" && dispute.status !== "resolved" && (
                <p className="mt-3 text-[13px] text-[var(--nsr-warning)]">
                  Simulated deposit on hold: {formatSar(dispute.heldDepositHalalas)}
                </p>
              )}
            </section>

            {dispute.resolution && (
              <section className="workspace-card">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="!mb-0">Outcome</h2>
                  {dispute.kind === "exchange" && dispute.heldDepositHalalas > 0 && <SimulatedTag />}
                </div>
                <p className="text-[14px]">
                  <strong>Item:</strong> {OUTCOME_LABELS[dispute.resolution.itemOutcome]}
                </p>
                {dispute.kind === "exchange" && dispute.heldDepositHalalas > 0 && (
                  <p className="text-[14px]">
                    <strong>Deposit:</strong> {formatSar(dispute.resolution.depositAllocation.refundHalalas)} refunded to
                    the borrower, {formatSar(dispute.resolution.depositAllocation.compensationHalalas)} to the owner
                    (simulated; no real money moves).
                  </p>
                )}
                <p className="mt-2 text-[14px] whitespace-pre-wrap">{dispute.resolution.rationale}</p>
                {dispute.resolvedAt && (
                  <p className="mt-2 text-[12px] text-[var(--nsr-text-secondary)]">
                    Decided by an authorised reviewer on {formatDateTime(dispute.resolvedAt)}
                  </p>
                )}
              </section>
            )}

            <section className="workspace-card">
              <h2>Statements</h2>
              {dispute.statements.length === 0 ? (
                <p className="text-[14px] text-[var(--nsr-text-secondary)]">No statements yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {dispute.statements.map((s, i) => (
                    <li key={i} className="rounded-[var(--nsr-radius-md)] border border-[var(--nsr-divider)] p-3">
                      <p className="text-[12px] text-[var(--nsr-text-secondary)]">
                        {s.byRole === "reviewer" ? "Reviewer" : nameOf(s.byUid)} · {formatDateTime(s.at)}
                      </p>
                      <p className="text-[14px] whitespace-pre-wrap">{s.text}</p>
                    </li>
                  ))}
                </ul>
              )}
              {dispute.status !== "resolved" && (
                <div className="mt-4">
                  <label className="booking-field">
                    <span>Add a statement (shared with the other member and the reviewer)</span>
                    <textarea rows={3} maxLength={1000} value={statement} onChange={(e) => setStatement(e.target.value)} />
                  </label>
                  {error && (
                    <div className="mt-2">
                      <Alert variant="error">{error}</Alert>
                    </div>
                  )}
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" loading={busy} disabled={!statement.trim()} onClick={submitStatement}>
                      Add statement
                    </Button>
                  </div>
                </div>
              )}
            </section>

            <section className="workspace-card">
              <h2>Condition records attached to the case</h2>
              {reports.length === 0 ? (
                <p className="text-[14px] text-[var(--nsr-text-secondary)]">This booking has no condition records.</p>
              ) : (
                <div className="flex flex-col gap-5">
                  {reports.map((r) => (
                    <div key={r.id}>
                      <h3 className="text-[15px] font-semibold mb-2">
                        {r.stage === "collection" ? "At collection" : "At return"}
                        {r.version > 1 ? ` (version ${r.version})` : ""}
                      </h3>
                      <ConditionSummary bookingId={id} report={r} submitterName={nameOf(r.submittedByUid)} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </ContentContainer>
  );
}
