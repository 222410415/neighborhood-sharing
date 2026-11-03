"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ContentContainer } from "@/components/layout/content-container";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/ui/image-upload";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingStatusBadge } from "@/features/bookings/components/booking-status-badge";
import { ConditionSummary } from "@/features/bookings/components/condition-summary";
import { useAuth } from "@/features/auth/auth-context";
import {
  acknowledgeCollection,
  correctConditionReport,
  fetchBooking,
  runBookingCommand,
  submitConditionReport,
} from "@/features/bookings/bookings-api";
import type { BookingDetail, OverallCondition } from "@/features/bookings/bookings-types";
import { errorText } from "@/lib/api-client";
import { newClientId } from "@/lib/format";

const CONDITIONS: { id: OverallCondition; label: string }[] = [
  { id: "new", label: "New" },
  { id: "excellent", label: "Excellent" },
  { id: "good", label: "Good" },
  { id: "fair", label: "Fair" },
  { id: "damaged", label: "Damaged" },
];

type Answer = "ok" | "problem" | null;

export default function ConditionPage({ params }: { params: Promise<{ id: string; stage: string }> }) {
  const { id, stage: rawStage } = use(params);
  const stage = rawStage === "collection" || rawStage === "return" ? rawStage : null;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [loadError, setLoadError] = useState<{ status: number; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const [overall, setOverall] = useState<OverallCondition | "">("");
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const requestId = useRef(newClientId("condition"));

  const [correcting, setCorrecting] = useState(false);
  const [ackChoice, setAckChoice] = useState<"agreed" | "disagreed" | null>(null);
  const [ackNote, setAckNote] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.push(`/sign-in?return=/bookings/${id}/condition/${rawStage}`);
  }, [authLoading, user, router, id, rawStage]);

  const load = useCallback(async () => {
    const res = await fetchBooking(id);
    setLoading(false);
    if (res.data) {
      setDetail(res.data);
      setLoadError(null);
    } else {
      setLoadError({ status: res.status, text: errorText(res.error, "This booking could not be loaded.") });
    }
  }, [id]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const checklistLabels = useMemo(() => {
    const accessories = detail?.booking.termsSnapshot.includedAccessories ?? [];
    return [
      ...accessories.map((a) => `${a} included`),
      "Item works as expected",
      "No new damage, marks or missing parts",
    ];
  }, [detail]);

  if (authLoading || !user || (loading && !loadError)) {
    return (
      <ContentContainer>
        <Skeleton className="h-10 w-72 mb-4" />
        <Skeleton className="h-96 w-full" />
      </ContentContainer>
    );
  }

  if (!stage || loadError || !detail) {
    return (
      <ContentContainer>
        <Link href={`/bookings/${id}`} className="back-link">
          <ArrowLeft size={15} /> Back to booking
        </Link>
        <div className="catalogue-state">
          <h1 className="section-title">
            {!stage || loadError?.status === 404 ? "Not found" : "Something went wrong"}
          </h1>
          <p>
            {!stage || loadError?.status === 404
              ? "This page does not exist or you are not part of this booking."
              : loadError?.text}
          </p>
        </div>
      </ContentContainer>
    );
  }

  const { booking, role, otherMember, availableCommands: can } = detail;
  const report = stage === "collection" ? detail.conditionReports.collection : detail.conditionReports.return;
  const canSubmit = can.includes(stage === "collection" ? "submit_collection_condition" : "submit_return_condition");
  const canAcknowledge = stage === "collection" && can.includes("acknowledge_collection");
  const canCorrect = detail.canCorrectCondition[stage];
  const history = detail.conditionHistory.filter((r) => r.stage === stage);
  const showForm = (!report && canSubmit) || (correcting && canCorrect);
  const stageTitle = stage === "collection" ? "Condition at collection" : "Condition at return";
  const nameOf = (uid: string) => (uid === user.uid ? "you" : otherMember.displayName);

  const submit = async () => {
    setFormError(null);
    if (!overall) {
      setFormError("Choose the overall condition.");
      return;
    }
    if (checklistLabels.some((label) => !answers[label])) {
      setFormError("Answer every checklist line with OK or Problem.");
      return;
    }
    setSubmitting(true);
    const send = correcting ? correctConditionReport : submitConditionReport;
    const res = await send(id, stage, {
      overallCondition: overall,
      checklist: checklistLabels.map((label) => ({
        label: label.slice(0, 80),
        ok: answers[label] === "ok",
        ...(itemNotes[label]?.trim() ? { note: itemNotes[label]!.trim().slice(0, 200) } : {}),
      })),
      notes: notes.trim(),
      mediaIds,
      clientRequestId: requestId.current,
    });
    if (!res.data) {
      setSubmitting(false);
      setFormError(errorText(res.error, "The condition record could not be submitted."));
      return;
    }
    if (stage === "return" && !correcting) {
      // Recording the return condition is followed by reporting the return.
      // Re-read the revision: the booking may have become overdue meanwhile.
      const latest = await fetchBooking(id);
      const ret = await runBookingCommand(id, "report-return", latest.data?.booking.revision ?? booking.revision);
      if (ret.error) {
        setSubmitting(false);
        setFormError(
          `The condition was recorded, but the return could not be reported: ${errorText(ret.error, "please try again")}. Use Report return on the booking page.`,
        );
        await load();
        return;
      }
    }
    router.push(`/bookings/${id}`);
  };

  const acknowledge = async () => {
    if (!ackChoice) return;
    setFormError(null);
    if (ackChoice === "disagreed" && !ackNote.trim()) {
      setFormError("Explain what does not match the record.");
      return;
    }
    setSubmitting(true);
    const res = await acknowledgeCollection(id, {
      decision: ackChoice,
      note: ackNote.trim() || undefined,
      expectedRevision: booking.revision,
    });
    setSubmitting(false);
    if (res.data) router.push(`/bookings/${id}`);
    else {
      setFormError(errorText(res.error, "Your answer could not be saved."));
      await load();
    }
  };

  return (
    <ContentContainer>
      <div className="max-w-3xl mx-auto">
        <Link href={`/bookings/${id}`} className="back-link">
          <ArrowLeft size={15} /> Back to booking
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <PageHeading title={stageTitle} subtitle={booking.termsSnapshot.titleEn} />
          <BookingStatusBadge status={booking.status} />
        </div>

        {report ? (
          <section className="workspace-card">
            <h2>Submitted record</h2>
            <ConditionSummary
              bookingId={id}
              report={report}
              submitterName={nameOf(report.submittedByUid)}
              acknowledgerName={report.acknowledgement ? nameOf(report.acknowledgement.byUid) : undefined}
            />
            <p className="mt-3 text-[12px] text-[var(--nsr-text-secondary)]">
              Version {report.version}. Submitted records cannot be edited; a correction is added as a new version and
              earlier versions stay readable. Photos are visible only to the two of you.
            </p>
            {canCorrect && !correcting && (
              <Button
                className="mt-3"
                size="sm"
                variant="secondary"
                onClick={() => {
                  requestId.current = newClientId("condition");
                  setCorrecting(true);
                }}
              >
                Submit a corrected record
              </Button>
            )}
          </section>
        ) : null}

        {history.length > 0 && (
          <section className="workspace-card">
            <h2>Earlier versions</h2>
            <div className="flex flex-col gap-4">
              {history.map((r) => (
                <div key={r.id}>
                  <h3 className="text-[14px] font-semibold mb-1">Version {r.version}</h3>
                  <ConditionSummary bookingId={id} report={r} submitterName={nameOf(r.submittedByUid)} />
                </div>
              ))}
            </div>
          </section>
        )}

        {showForm ? (
          <section className="workspace-card">
            <h2>
              {correcting
                ? "Corrected record (new version)"
                : stage === "collection"
                  ? "Record the condition before handing over"
                  : "Record the condition as you return it"}
            </h2>
            <p className="text-[13px] text-[var(--nsr-text-secondary)] mb-4">
              {stage === "collection"
                ? `${otherMember.displayName} will review this record and agree or record a disagreement.`
                : "Submitting also reports the return. The owner then checks the item and confirms receipt."}
            </p>

            <fieldset className="mb-5">
              <legend className="text-[14px] font-semibold mb-2">Checklist</legend>
              <div className="flex flex-col gap-2">
                {checklistLabels.map((label) => (
                  <div key={label} className="rounded-[var(--nsr-radius-md)] border border-[var(--nsr-divider)] px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[14px]">{label}</span>
                      <div className="flex gap-3 text-[13px]" role="radiogroup" aria-label={label}>
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="radio"
                            name={`check-${label}`}
                            checked={answers[label] === "ok"}
                            onChange={() => setAnswers((a) => ({ ...a, [label]: "ok" }))}
                          />
                          OK
                        </label>
                        <label className="inline-flex items-center gap-1">
                          <input
                            type="radio"
                            name={`check-${label}`}
                            checked={answers[label] === "problem"}
                            onChange={() => setAnswers((a) => ({ ...a, [label]: "problem" }))}
                          />
                          Problem
                        </label>
                      </div>
                    </div>
                    {answers[label] === "problem" && (
                      <input
                        className="mt-2 w-full rounded-[var(--nsr-radius-sm)] border border-[var(--nsr-control-outline)] px-2 py-1 text-[13px]"
                        placeholder="What is wrong?"
                        maxLength={200}
                        aria-label={`Problem with ${label}`}
                        value={itemNotes[label] ?? ""}
                        onChange={(e) => setItemNotes((n) => ({ ...n, [label]: e.target.value }))}
                      />
                    )}
                  </div>
                ))}
              </div>
            </fieldset>

            <label className="booking-field mb-4">
              <span>Overall condition</span>
              <select value={overall} onChange={(e) => setOverall(e.target.value as OverallCondition | "")}>
                <option value="">Choose...</option>
                {CONDITIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="booking-field mb-4">
              <span>Notes (optional)</span>
              <textarea rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </label>

            <div className="mb-4">
              <p className="text-[14px] font-semibold mb-2">Photos (optional, up to 3)</p>
              <ImageUpload
                mediaIds={mediaIds}
                onMediaIdsChange={setMediaIds}
                clientSubmissionPrefix={`condition-${id}-${stage}`}
                purpose="condition"
              />
              <p className="mt-1 text-[12px] text-[var(--nsr-text-secondary)]">
                Condition photos are private to this booking and never shown on the item page.
              </p>
            </div>

            {formError && (
              <div className="mb-3">
                <Alert variant="error">{formError}</Alert>
              </div>
            )}
            <div className="flex justify-end">
              <Button loading={submitting} onClick={submit}>
                {correcting
                  ? "Submit corrected record"
                  : stage === "collection"
                    ? "Submit condition record"
                    : "Submit and report return"}
              </Button>
            </div>
          </section>
        ) : report ? null : (
          <section className="workspace-card">
            <p className="text-[14px]">
              {stage === "collection"
                ? role === "owner"
                  ? "The collection record can be made once the booking is confirmed."
                  : `${otherMember.displayName} records the condition when handing the item over.`
                : role === "owner"
                  ? `${otherMember.displayName} records the condition when returning the item.`
                  : "The return record can be made while you have the item."}
            </p>
          </section>
        )}

        {report && canAcknowledge && (
          <section className="workspace-card">
            <h2>Your answer</h2>
            <p className="text-[13px] text-[var(--nsr-text-secondary)] mb-3">
              Agreeing confirms you received the item as recorded and starts the booking. A disagreement is recorded
              for both of you and the booking does not start.
            </p>
            <div className="flex flex-wrap gap-2 mb-3">
              <label className="choice-card">
                <input
                  type="radio"
                  name="ack"
                  checked={ackChoice === "agreed"}
                  onChange={() => setAckChoice("agreed")}
                />
                <span>The record matches the item</span>
              </label>
              <label className="choice-card">
                <input
                  type="radio"
                  name="ack"
                  checked={ackChoice === "disagreed"}
                  onChange={() => setAckChoice("disagreed")}
                />
                <span>Record a disagreement</span>
              </label>
            </div>
            {ackChoice === "disagreed" && (
              <label className="booking-field mb-3">
                <span>What does not match?</span>
                <textarea rows={3} maxLength={500} value={ackNote} onChange={(e) => setAckNote(e.target.value)} />
              </label>
            )}
            {formError && (
              <div className="mb-3">
                <Alert variant="error">{formError}</Alert>
              </div>
            )}
            <div className="flex justify-end">
              <Button loading={submitting} disabled={!ackChoice} onClick={acknowledge}>
                {ackChoice === "disagreed" ? "Record disagreement" : "Agree and collect"}
              </Button>
            </div>
          </section>
        )}
      </div>
    </ContentContainer>
  );
}
