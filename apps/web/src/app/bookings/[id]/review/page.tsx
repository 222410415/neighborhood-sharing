"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Star } from "lucide-react";
import { ContentContainer } from "@/components/layout/content-container";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-context";
import { fetchBooking } from "@/features/bookings/bookings-api";
import type { BookingDetail } from "@/features/bookings/bookings-types";
import { createReview } from "@/features/trust/trust-api";
import { errorText } from "@/lib/api-client";
import { formatDate } from "@/lib/format";

const LABELS = ["", "Poor", "Below expectations", "Fine", "Good", "Excellent"];

export default function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [detail, setDetail] = useState<BookingDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push(`/sign-in?return=/bookings/${id}/review`);
  }, [authLoading, user, router, id]);

  useEffect(() => {
    if (!user) return;
    fetchBooking(id).then((res) => {
      if (res.data) setDetail(res.data);
      else setLoadError(res.status === 404 ? "This booking does not exist or you are not part of it." : errorText(res.error, "The booking could not be loaded."));
    });
  }, [user, id]);

  if (authLoading || (!detail && !loadError)) {
    return (
      <ContentContainer>
        <Skeleton className="h-64 w-full max-w-2xl mx-auto" />
      </ContentContainer>
    );
  }
  if (!detail) {
    return (
      <ContentContainer>
        <div className="max-w-2xl mx-auto">
          <Alert variant="error">{loadError}</Alert>
        </div>
      </ContentContainer>
    );
  }

  const { review, otherMember, booking } = detail;

  const submit = async () => {
    if (rating < 1) {
      setError("Choose a rating from 1 to 5.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await createReview(id, { rating, comment: comment.trim() });
    setBusy(false);
    if (res.data) router.push(`/bookings/${id}`);
    else setError(errorText(res.error, "Your review could not be saved."));
  };

  return (
    <ContentContainer>
      <div className="max-w-2xl mx-auto">
        <Link href={`/bookings/${id}`} className="back-link">
          <ArrowLeft size={15} /> Back to booking
        </Link>
        <PageHeading
          title={`Review ${otherMember.displayName}`}
          subtitle={`About your exchange of ${booking.termsSnapshot.titleEn}. Your review is about the person, not the item.`}
        />
        {review.mine ? (
          <Alert variant="info" title="Already reviewed">
            You rated this exchange {review.mine.rating} out of 5 on {formatDate(review.mine.createdAt)}. Reviews cannot
            be changed.
          </Alert>
        ) : !review.canReview ? (
          <Alert variant="info">
            {booking.status !== "completed"
              ? "Reviews open once the exchange is completed."
              : "The review window for this exchange has closed."}
          </Alert>
        ) : (
          <section className="workspace-card">
            <fieldset>
              <legend className="text-[14px] font-semibold mb-2">Rating</legend>
              <div className="flex gap-1" role="radiogroup" aria-label="Rating from 1 to 5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className="cursor-pointer" title={LABELS[n]}>
                    <input
                      type="radio"
                      name="rating"
                      value={n}
                      className="sr-only"
                      checked={rating === n}
                      onChange={() => setRating(n)}
                      aria-label={`${n} - ${LABELS[n]}`}
                    />
                    <Star
                      size={30}
                      aria-hidden="true"
                      className={n <= rating ? "fill-[#e0a526] text-[#e0a526]" : "text-[var(--nsr-control-outline)]"}
                    />
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[13px] text-[var(--nsr-text-secondary)]">
                {rating > 0 ? `${rating} - ${LABELS[rating]}` : "No rating chosen yet"}
              </p>
            </fieldset>
            <label className="booking-field mt-4">
              <span>Comment (optional, public)</span>
              <textarea rows={4} maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
            </label>
            <p className="mt-1 text-[12px] text-[var(--nsr-text-secondary)]">
              {comment.length}/500. Keep it about the exchange; do not include contact details.
            </p>
            {review.reviewWindowEndsAt && (
              <p className="mt-2 text-[12px] text-[var(--nsr-text-secondary)]">
                You can review until {formatDate(review.reviewWindowEndsAt)}. Reviews cannot be edited afterwards.
              </p>
            )}
            {error && (
              <div className="mt-3">
                <Alert variant="error">{error}</Alert>
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <Button loading={busy} onClick={submit}>
                Submit review
              </Button>
            </div>
          </section>
        )}
      </div>
    </ContentContainer>
  );
}
