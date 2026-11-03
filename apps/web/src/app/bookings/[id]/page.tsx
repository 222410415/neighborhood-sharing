"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MessageCircle, RefreshCw } from "lucide-react";
import { ContentContainer } from "@/components/layout/content-container";
import { Alert } from "@/components/ui/alert";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrangementCard } from "@/features/bookings/components/arrangement-card";
import { BookingStatusBadge } from "@/features/bookings/components/booking-status-badge";
import { ConditionSummary } from "@/features/bookings/components/condition-summary";
import { PaymentsPanel } from "@/features/bookings/components/payments-panel";
import { PolicyAssistant } from "@/features/ai/components/policy-assistant";
import { useAuth } from "@/features/auth/auth-context";
import { cancelBooking, fetchBooking, runBookingCommand } from "@/features/bookings/bookings-api";
import { EVENT_LABELS, nextStepText } from "@/features/bookings/booking-labels";
import type { Booking, BookingDetail } from "@/features/bookings/bookings-types";
import { errorText, type ApiResponse } from "@/lib/api-client";
import { formatDateTime, formatSar } from "@/lib/format";

export default function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ status: number; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  useEffect(() => {
    if (!authLoading && !user) router.push(`/sign-in?return=/bookings/${id}`);
  }, [authLoading, user, router, id]);

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

  const run = async (action: () => Promise<ApiResponse<Booking>>) => {
    setBusy(true);
    setActionError(null);
    const res = await action();
    setBusy(false);
    if (res.error) setActionError(errorText(res.error, "That did not work. Please try again."));
    await load();
    return !res.error;
  };

  if (authLoading || (loading && !loadError)) {
    return (
      <ContentContainer>
        <Skeleton className="h-6 w-32 mb-4" />
        <Skeleton className="h-32 w-full mb-3" />
        <Skeleton className="h-48 w-full" />
      </ContentContainer>
    );
  }
  if (!user) return null;

  if (loadError || !detail) {
    return (
      <ContentContainer>
        <Link href="/bookings" className="back-link">
          <ArrowLeft size={15} /> Back to bookings
        </Link>
        <div className="catalogue-state">
          <h1 className="section-title">
            {loadError?.status === 404 ? "Booking not found" : "Something went wrong"}
          </h1>
          <p>
            {loadError?.status === 404
              ? "This booking does not exist or you are not one of its two participants."
              : loadError?.text}
          </p>
        </div>
      </ContentContainer>
    );
  }

  const { booking, role, otherMember, availableCommands: can } = detail;
  const terms = booking.termsSnapshot;
  const has = (c: (typeof can)[number]) => can.includes(c);
  const viewerUid = user.uid;
  const nameOf = (uid: string) => (uid === viewerUid ? "you" : otherMember.displayName);
  const collection = detail.conditionReports.collection;
  const returnReport = detail.conditionReports.return;
  const showArrangements = ["confirmed", "active", "overdue", "return_pending", "disputed", "completed"].includes(
    booking.status,
  );

  return (
    <ContentContainer>
      <div className="flex items-center justify-between gap-3">
        <Link href={role === "owner" ? "/bookings?view=lending" : "/bookings"} className="back-link">
          <ArrowLeft size={15} /> Back to bookings
        </Link>
        <button
          type="button"
          onClick={() => load()}
          className="back-link !mb-[22px] bg-transparent border-0"
          aria-label="Refresh booking"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {/* Header */}
      <section className="workspace-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="detail-kicker !mt-0">{role === "owner" ? "Lending" : "Borrowing"}</p>
            <h1 className="detail-title !text-[34px]">
              {detail.listing.isPublic ? (
                <Link href={`/items/${booking.listingId}`} className="hover:underline">
                  {terms.titleEn}
                </Link>
              ) : (
                terms.titleEn
              )}
            </h1>
            <p className="text-[14px] text-[var(--nsr-text-secondary)]">
              {formatDateTime(booking.startAt)} to {formatDateTime(booking.endAt)} (Riyadh time) ·{" "}
              {terms.billableDays} day{terms.billableDays === 1 ? "" : "s"}
            </p>
          </div>
          <BookingStatusBadge status={booking.status} className="!text-[14px]" />
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="owner-row">
            <AvatarInitials name={otherMember.displayName} size="md" />
            <div>
              <Link href={`/members/${otherMember.uid}`} className="hover:underline">
                <strong>{otherMember.displayName}</strong>
              </Link>
              <span>{role === "owner" ? "Borrower" : "Owner"}</span>
            </div>
          </div>
          {detail.conversationId && (
            <Link
              href={`/messages/${encodeURIComponent(detail.conversationId)}`}
              className="inline-flex items-center gap-2 rounded-[var(--nsr-radius-md)] border border-[var(--nsr-control-outline)] px-4 py-2 text-[14px] font-semibold text-[var(--nsr-primary)] hover:bg-[var(--nsr-selected-background)]"
            >
              <MessageCircle size={16} /> Message {otherMember.displayName}
            </Link>
          )}
        </div>
      </section>

      {/* Next action */}
      <section className="workspace-card" aria-labelledby="next-heading">
        <h2 id="next-heading">Next step</h2>
        <p className="text-[14px]">{nextStepText(booking.status, role)}</p>
        {booking.status === "pending" && booking.expiresAt && (
          <p className="text-[13px] text-[var(--nsr-text-secondary)]">
            The request expires {formatDateTime(booking.expiresAt)} if not answered.
          </p>
        )}
        {booking.status === "accepted" && booking.expiresAt && (
          <p className="text-[13px] text-[var(--nsr-text-secondary)]">
            The dates are held until {formatDateTime(booking.expiresAt)}.
          </p>
        )}
        {detail.itemOnHold && role === "owner" && booking.status !== "disputed" && (
          <p className="text-[13px] text-[var(--nsr-warning)]">New bookings for this item are paused until this is closed.</p>
        )}
        {booking.status === "disputed" && (
          <div className="mt-3">
            <Alert variant="warning" title="Under review">
              An authorised reviewer will decide the case. The booking and the simulated deposit stay on hold until then.{" "}
              <Link href={`/bookings/${id}/dispute`} className="underline font-semibold">
                Follow the case
              </Link>
            </Alert>
          </div>
        )}
        {detail.review.mine && (
          <p className="mt-2 text-[13px] text-[var(--nsr-text-secondary)]">
            You reviewed {otherMember.displayName} ({detail.review.mine.rating} out of 5).
            {detail.review.theirsSubmitted ? ` ${otherMember.displayName} has reviewed you too.` : ""}
          </p>
        )}
        {actionError && (
          <div className="mt-3">
            <Alert variant="error">{actionError}</Alert>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {detail.review.canReview && (
            <Link className="header-cta" href={`/bookings/${id}/review`}>
              Review {otherMember.displayName}
            </Link>
          )}
          {has("accept") && (
            <Button loading={busy} onClick={() => run(() => runBookingCommand(id, "accept", booking.revision))}>
              Accept request
            </Button>
          )}
          {has("decline") && (
            <Button
              variant="secondary"
              loading={busy}
              onClick={() => run(() => runBookingCommand(id, "decline", booking.revision))}
            >
              Decline
            </Button>
          )}
          {has("confirm") && (
            <Button loading={busy} onClick={() => run(() => runBookingCommand(id, "confirm", booking.revision))}>
              {terms.totalHalalas > 0
                ? `Confirm and pay ${formatSar(terms.totalHalalas)} (simulated)`
                : "Confirm booking"}
            </Button>
          )}
          {has("submit_collection_condition") && (
            <Link className="header-cta" href={`/bookings/${id}/condition/collection`}>
              Record collection condition
            </Link>
          )}
          {has("acknowledge_collection") && (
            <Link className="header-cta" href={`/bookings/${id}/condition/collection`}>
              Review the collection record
            </Link>
          )}
          {has("submit_return_condition") && (
            <Link className="header-cta" href={`/bookings/${id}/condition/return`}>
              Return the item
            </Link>
          )}
          {has("report_return") && !has("submit_return_condition") && (
            <Button loading={busy} onClick={() => run(() => runBookingCommand(id, "report-return", booking.revision))}>
              Report return
            </Button>
          )}
          {has("confirm_receipt") && (
            <Button
              loading={busy}
              onClick={() => run(() => runBookingCommand(id, "confirm-receipt", booking.revision))}
            >
              Confirm receipt{detail.deposit?.heldHalalas ? " and release deposit" : ""}
            </Button>
          )}
          {(detail.canOpenDispute || detail.disputeId) && (
            <Link
              className="inline-flex items-center justify-center rounded-[var(--nsr-radius-md)] border border-[var(--nsr-control-outline)] px-5 py-2.5 text-[14px] font-medium text-[var(--nsr-primary)] hover:bg-[var(--nsr-selected-background)]"
              href={`/bookings/${id}/dispute`}
            >
              {detail.disputeId ? "View case" : booking.status === "completed" ? "Raise a complaint" : "Report a problem"}
            </Link>
          )}
          {has("cancel") && (
            <Button
              variant="ghost"
              onClick={() => {
                setActionError(null);
                setCancelOpen(true);
              }}
            >
              Cancel booking
            </Button>
          )}
        </div>
      </section>

      <div className="detail-grid !gap-4 !items-start">
        <div>
          {showArrangements && (
            <section className="workspace-card">
              <h2>Arrangements</h2>
              <p className="text-[13px] text-[var(--nsr-text-secondary)] mb-3">
                Agree when and where to hand the item over. Only the two of you can see these details.
              </p>
              <div className="flex flex-col gap-3">
                <ArrangementCard
                  bookingId={id}
                  kind="pickup"
                  arrangement={detail.arrangements.pickup}
                  canEdit={has("arrange_pickup")}
                  viewerUid={viewerUid}
                  otherName={otherMember.displayName}
                  defaultTime={booking.startAt}
                  onChanged={load}
                />
                <ArrangementCard
                  bookingId={id}
                  kind="return"
                  arrangement={detail.arrangements.return}
                  canEdit={has("arrange_return")}
                  viewerUid={viewerUid}
                  otherName={otherMember.displayName}
                  defaultTime={booking.endAt}
                  onChanged={load}
                />
              </div>
            </section>
          )}

          {showArrangements && (
            <section className="workspace-card">
              <h2>Condition records</h2>
              <div className="flex flex-col gap-5">
                <div>
                  <h3 className="text-[15px] font-semibold mb-2">At collection</h3>
                  {collection ? (
                    <ConditionSummary
                      bookingId={id}
                      report={collection}
                      submitterName={nameOf(collection.submittedByUid)}
                      acknowledgerName={
                        collection.acknowledgement ? nameOf(collection.acknowledgement.byUid) : undefined
                      }
                    />
                  ) : (
                    <p className="text-[13px] text-[var(--nsr-text-secondary)]">
                      The owner records the item&apos;s condition when handing it over.
                    </p>
                  )}
                </div>
                <div>
                  <h3 className="text-[15px] font-semibold mb-2">At return</h3>
                  {returnReport ? (
                    <ConditionSummary
                      bookingId={id}
                      report={returnReport}
                      submitterName={nameOf(returnReport.submittedByUid)}
                    />
                  ) : (
                    <p className="text-[13px] text-[var(--nsr-text-secondary)]">
                      The borrower records the item&apos;s condition when returning it.
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          <section className="workspace-card">
            <h2>Timeline</h2>
            <ol className="timeline">
              {detail.events.map((event) => (
                <li key={event.id}>
                  <p className="text-[14px] font-semibold">{EVENT_LABELS[event.eventType] ?? event.eventType}</p>
                  <p className="text-[12px] text-[var(--nsr-text-secondary)]">
                    {formatDateTime(event.occurredAt)} ·{" "}
                    {event.eventType === "dispute_resolved"
                      ? "authorised reviewer"
                      : event.actorRole === "system"
                        ? "automatic"
                        : nameOf(event.actorUid)}
                  </p>
                  {event.note && <p className="text-[13px] text-[var(--nsr-text-secondary)]">{event.note}</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>

        <div>
          <PaymentsPanel terms={terms} payments={detail.payments} deposit={detail.deposit} />
          <section className="workspace-card">
            <h2>Agreed terms</h2>
            <div className="term-line">
              <span>Lending</span>
              <strong>{terms.lendingMode === "free" ? "Free" : `${formatSar(terms.dailyRateHalalas)} / day`}</strong>
            </div>
            <div className="term-line">
              <span>Billable days</span>
              <strong>{terms.billableDays}</strong>
            </div>
            <div className="term-line">
              <span>Rental fee</span>
              <strong>{formatSar(terms.rentalFeeHalalas)}</strong>
            </div>
            <div className="term-line">
              <span>Refundable deposit</span>
              <strong>{formatSar(terms.depositHalalas)}</strong>
            </div>
            <div className="term-line">
              <span>Condition when listed</span>
              <strong className="capitalize">{terms.condition}</strong>
            </div>
            {terms.includedAccessories.length > 0 && (
              <div className="mt-2">
                {terms.includedAccessories.map((a) => (
                  <span className="detail-tag" key={a}>
                    {a}
                  </span>
                ))}
              </div>
            )}
            <p className="term-note">{terms.policyNote}</p>
          </section>
          <PolicyAssistant bookingId={id} />
        </div>
      </div>

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title="Cancel this booking?">
        <p className="mb-3 text-[14px]">
          {booking.status === "confirmed"
            ? "The dates are released and the simulated payments are refunded in full."
            : "The request is closed and any held dates are released."}
        </p>
        <label className="booking-field">
          <span>Reason (optional, shown to {otherMember.displayName})</span>
          <textarea rows={2} maxLength={500} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
        </label>
        {actionError && (
          <div className="mt-3">
            <Alert variant="error">{actionError}</Alert>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setCancelOpen(false)}>
            Keep booking
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              const ok = await run(() => cancelBooking(id, booking.revision, cancelReason.trim()));
              if (ok) setCancelOpen(false);
            }}
          >
            Cancel booking
          </Button>
        </div>
      </Dialog>

    </ContentContainer>
  );
}
