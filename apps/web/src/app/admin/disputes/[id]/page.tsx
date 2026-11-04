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
import { BookingStatusBadge, SimulatedTag } from "@/features/bookings/components/booking-status-badge";
import { ConditionSummary } from "@/features/bookings/components/condition-summary";
import { EVENT_LABELS } from "@/features/bookings/booking-labels";
import { useAuth } from "@/features/auth/auth-context";
import {
  CATEGORY_LABELS,
  ISSUE_LABELS,
  OUTCOME_LABELS,
  assignDispute,
  disputePhotoPath,
  fetchDisputeEvidence,
  resolveDispute,
  type DisputeEvidence,
  type ItemOutcome,
} from "@/features/trust/trust-api";
import { errorText } from "@/lib/api-client";
import { formatDateTime, formatSar } from "@/lib/format";

export default function AdminDisputePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [evidence, setEvidence] = useState<DisputeEvidence | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "unassigned" | "conflict" | "forbidden" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<ItemOutcome | "">("");
  const [rationale, setRationale] = useState("");
  const [refundSar, setRefundSar] = useState("");
  const [compensationSar, setCompensationSar] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push(`/sign-in?return=/admin/disputes/${id}`);
  }, [authLoading, user, router, id]);

  const load = useCallback(async () => {
    const res = await fetchDisputeEvidence(id);
    if (res.data) {
      setEvidence(res.data);
      setState("ready");
      return;
    }
    const reason = (res.error?.details as { reason?: string } | undefined)?.reason;
    setMessage(errorText(res.error, "The case could not be loaded."));
    setState(
      res.status === 403 ? "forbidden" : reason === "not_assigned" ? "unassigned" : reason === "conflict_of_interest" ? "conflict" : "error",
    );
  }, [id]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (authLoading || state === "loading") {
    return <ContentContainer><Skeleton className="h-96 w-full" /></ContentContainer>;
  }

  if (state !== "ready" || !evidence) {
    return (
      <ContentContainer>
        <Link href="/admin" className="back-link">
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
                const res = await assignDispute(id);
                setBusy(false);
                if (res.error) setMessage(errorText(res.error, "Could not assign the case."));
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

  const { dispute, booking, owner, borrower, deposit } = evidence;
  const held = dispute.kind === "exchange" ? (deposit?.heldHalalas ?? 0) : 0;
  const refund = Math.round((parseFloat(refundSar) || 0) * 100);
  const compensation = Math.round((parseFloat(compensationSar) || 0) * 100);
  const balanced = refund + compensation === held && refund >= 0 && compensation >= 0;
  const nameOf = (uid: string) => (uid === owner.uid ? `${owner.displayName} (owner)` : uid === borrower.uid ? `${borrower.displayName} (borrower)` : "Reviewer");

  const resolve = async () => {
    setError(null);
    if (!outcome || !rationale.trim()) {
      setError("Choose the item outcome and record your reasoning.");
      return;
    }
    if (!balanced) {
      setError(`Refund and compensation must add up to ${formatSar(held)}.`);
      return;
    }
    setBusy(true);
    const res = await resolveDispute(id, {
      expectedRevision: dispute.revision,
      rationale: rationale.trim(),
      itemOutcome: outcome,
      refundHalalas: refund,
      compensationHalalas: compensation,
    });
    setBusy(false);
    if (res.error) setError(errorText(res.error, "The case could not be resolved."));
    await load();
  };

  return (
    <ContentContainer>
      <Link href="/admin" className="back-link">
        <ArrowLeft size={15} /> Back to the workspace
      </Link>
      <PageHeading
        title={`${ISSUE_LABELS[dispute.issue]}: ${booking.termsSnapshot.titleEn}`}
        subtitle={`Case ${dispute.kind === "complaint" ? "(complaint after completion)" : ""} opened ${formatDateTime(dispute.createdAt)} by ${nameOf(dispute.openedByUid)}. Your reads of this evidence are recorded in the audit trail.`}
      />
      <div className="detail-grid !gap-4 !items-start">
        <div>
          <section className="workspace-card">
            <h2>Description</h2>
            <p className="text-[14px] whitespace-pre-wrap">{dispute.description}</p>
            <h3 className="mt-4 text-[15px] font-semibold">Statements</h3>
            {dispute.statements.length === 0 ? (
              <p className="text-[13px] text-[var(--nsr-text-secondary)]">None.</p>
            ) : (
              <ul className="flex flex-col gap-2 mt-2">
                {dispute.statements.map((s, i) => (
                  <li key={i} className="rounded-[var(--nsr-radius-md)] border border-[var(--nsr-divider)] p-3">
                    <p className="text-[12px] text-[var(--nsr-text-secondary)]">
                      {nameOf(s.byUid)} · {formatDateTime(s.at)}
                    </p>
                    <p className="text-[14px] whitespace-pre-wrap">{s.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="workspace-card">
            <h2>Condition records</h2>
            {evidence.conditionReports.length === 0 ? (
              <p className="text-[14px] text-[var(--nsr-text-secondary)]">No condition records.</p>
            ) : (
              <div className="flex flex-col gap-5">
                {evidence.conditionReports.map((r) => (
                  <div key={r.id}>
                    <h3 className="text-[15px] font-semibold mb-2">
                      {r.stage === "collection" ? "At collection" : "At return"} (version {r.version})
                    </h3>
                    <ConditionSummary
                      bookingId={booking.id}
                      report={r}
                      submitterName={nameOf(r.submittedByUid)}
                      acknowledgerName={r.acknowledgement ? nameOf(r.acknowledgement.byUid) : undefined}
                      photoPath={(mediaId, variant) => disputePhotoPath(id, mediaId, variant)}
                    />
                  </div>
                ))}
              </div>
            )}
          </section>

          {evidence.linkedReports.length > 0 && (
            <section className="workspace-card">
              <h2>Linked reports</h2>
              <ul className="flex flex-col gap-2">
                {evidence.linkedReports.map((r) => (
                  <li key={r.id} className="text-[14px]">
                    <strong>{CATEGORY_LABELS[r.category]}</strong> ({r.status}): {r.description}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="workspace-card">
            <h2>Booking timeline</h2>
            <ol className="timeline">
              {evidence.events.map((e) => (
                <li key={e.id}>
                  <p className="text-[14px] font-semibold">{EVENT_LABELS[e.eventType] ?? e.eventType}</p>
                  <p className="text-[12px] text-[var(--nsr-text-secondary)]">
                    {formatDateTime(e.occurredAt)} · {e.actorRole === "system" ? "automatic" : nameOf(e.actorUid)}
                  </p>
                  {e.note && <p className="text-[13px] text-[var(--nsr-text-secondary)]">{e.note}</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div>
          <section className="workspace-card">
            <div className="flex items-center justify-between gap-2">
              <h2 className="!mb-0">Booking</h2>
              <BookingStatusBadge status={booking.status} />
            </div>
            <p className="mt-2 text-[13px]">
              {formatDateTime(booking.startAt)} to {formatDateTime(booking.endAt)}
            </p>
            <p className="text-[13px]">Owner: {owner.displayName}</p>
            <p className="text-[13px]">Borrower: {borrower.displayName}</p>
            <div className="mt-3 rounded-[var(--nsr-radius-md)] bg-[var(--nsr-background)] p-3">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-semibold">Deposit</p>
                <SimulatedTag />
              </div>
              <p className="text-[13px]">Held: {formatSar(deposit?.heldHalalas ?? 0)}</p>
              <p className="text-[13px]">Refunded: {formatSar(deposit?.refundedHalalas ?? 0)}</p>
              <p className="text-[13px]">Compensation: {formatSar(deposit?.compensationHalalas ?? 0)}</p>
            </div>
          </section>

          {dispute.status === "resolved" && dispute.resolution ? (
            <section className="workspace-card">
              <h2>Resolved</h2>
              <p className="text-[14px]">Item: {OUTCOME_LABELS[dispute.resolution.itemOutcome]}</p>
              <p className="text-[14px]">
                Refund {formatSar(dispute.resolution.depositAllocation.refundHalalas)}, compensation{" "}
                {formatSar(dispute.resolution.depositAllocation.compensationHalalas)} (simulated)
              </p>
              <p className="mt-2 text-[14px] whitespace-pre-wrap">{dispute.resolution.rationale}</p>
            </section>
          ) : (
            <section className="workspace-card">
              <h2>Resolve</h2>
              <label className="booking-field mb-3">
                <span>Item outcome</span>
                <select value={outcome} onChange={(e) => setOutcome(e.target.value as ItemOutcome | "")}>
                  <option value="">Choose...</option>
                  {(Object.keys(OUTCOME_LABELS) as ItemOutcome[]).map((k) => (
                    <option key={k} value={k}>
                      {OUTCOME_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              {(outcome === "lost" || outcome === "needs_repair") && (
                <p className="mb-3 text-[12px] text-[var(--nsr-warning)]">
                  The listing will be paused and stay unavailable until the owner republishes it.
                </p>
              )}
              {held > 0 ? (
                <>
                  <p className="text-[13px] mb-2">
                    Allocate the held {formatSar(held)}. Both parts must add up to the held amount.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="booking-field">
                      <span>Refund to borrower (SAR)</span>
                      <input type="number" min="0" step="0.01" value={refundSar} onChange={(e) => setRefundSar(e.target.value)} />
                    </label>
                    <label className="booking-field">
                      <span>Compensation to owner (SAR)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={compensationSar}
                        onChange={(e) => setCompensationSar(e.target.value)}
                      />
                    </label>
                  </div>
                  <p
                    className={`mt-2 text-[13px] font-semibold ${balanced ? "text-[var(--nsr-success)]" : "text-[var(--nsr-error)]"}`}
                    aria-live="polite"
                  >
                    {balanced
                      ? "Balanced"
                      : `Not balanced: ${formatSar(refund + compensation)} of ${formatSar(held)} allocated`}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setRefundSar(String(held / 100));
                        setCompensationSar("0");
                      }}
                    >
                      Full refund
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setRefundSar("0");
                        setCompensationSar(String(held / 100));
                      }}
                    >
                      All to owner
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-[13px] mb-2">No deposit is held, so no money is allocated.</p>
              )}
              <label className="booking-field mt-3">
                <span>Reasoning (shared with both members)</span>
                <textarea rows={4} maxLength={2000} value={rationale} onChange={(e) => setRationale(e.target.value)} />
              </label>
              {error && (
                <div className="mt-3">
                  <Alert variant="error">{error}</Alert>
                </div>
              )}
              <div className="mt-3 flex justify-end">
                <Button loading={busy} disabled={held > 0 && !balanced} onClick={resolve}>
                  Resolve case
                </Button>
              </div>
            </section>
          )}
        </div>
      </div>
    </ContentContainer>
  );
}
