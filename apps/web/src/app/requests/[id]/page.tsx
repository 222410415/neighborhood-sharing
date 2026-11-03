"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, MapPin } from "lucide-react";
import { ContentContainer } from "@/components/layout/content-container";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-context";
import {
  closeRequest,
  fetchRequest,
  offerListing,
  selectOffer,
  withdrawOffer,
  type RequestPost,
} from "@/features/community/community-api";
import { fetchMyListings, type OwnerListing } from "@/features/listings/listings-api";
import { CATEGORIES } from "@/lib/catalogue-options";
import { errorText, type ApiResponse } from "@/lib/api-client";
import { formatDateTime, formatSar } from "@/lib/format";

export default function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuth();
  const [request, setRequest] = useState<RequestPost | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [myListings, setMyListings] = useState<OwnerListing[]>([]);
  const [listingId, setListingId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetchRequest(id);
    if (res.data) setRequest(res.data);
    else setNotFound(true);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    fetchMyListings("published").then((res) => setMyListings(res.data?.items ?? []));
  }, [user]);

  if (notFound) {
    return (
      <ContentContainer>
        <Link href="/requests" className="back-link">
          <ArrowLeft size={15} /> Back to requests
        </Link>
        <div className="catalogue-state">
          <h1 className="section-title">Request not found</h1>
        </div>
      </ContentContainer>
    );
  }
  if (!request) return <ContentContainer><Skeleton className="h-64 w-full" /></ContentContainer>;

  const isAuthor = user?.uid === request.authorUid;
  const open = request.status === "open";
  const offers = request.offers ?? [];
  const myOffers = offers.filter((o) => o.ownerUid === user?.uid);

  const run = async (key: string, action: () => Promise<ApiResponse<unknown>>) => {
    setBusy(key);
    setError(null);
    const res = await action();
    setBusy(null);
    if (res.error) setError(errorText(res.error, "That did not work."));
    await load();
  };

  const choose = async (offerId: string) => {
    setBusy(offerId);
    setError(null);
    const res = await selectOffer(id, offerId);
    setBusy(null);
    if (res.data) router.push(res.data.reviewPath);
    else setError(errorText(res.error, "The offer could not be chosen."));
  };

  return (
    <ContentContainer>
      <div className="max-w-3xl mx-auto">
        <Link href="/requests" className="back-link">
          <ArrowLeft size={15} /> Back to requests
        </Link>
        <section className="workspace-card">
          <p className="detail-kicker !mt-0">{CATEGORIES.find((c) => c.id === request.categoryId)?.name ?? "Request"}</p>
          <h1 className="detail-title !text-[32px]">{request.title}</h1>
          <p className="text-[14px] text-[var(--nsr-text-secondary)]">
            <MapPin size={13} className="inline" /> {request.neighborhoodName} · {formatDateTime(request.desiredStartAt)} to{" "}
            {formatDateTime(request.desiredEndAt)}
            {request.maxDailyRateHalalas !== null ? ` · budget up to ${formatSar(request.maxDailyRateHalalas)}/day` : ""}
          </p>
          <p className="text-[13px] text-[var(--nsr-text-secondary)]">
            Asked by {request.authorName} · status: {request.status}
          </p>
          {request.description && <p className="mt-3 text-[14px] whitespace-pre-wrap">{request.description}</p>}
          {isAuthor && open && (
            <Button
              className="mt-3"
              size="sm"
              variant="secondary"
              loading={busy === "close"}
              onClick={() => run("close", () => closeRequest(id))}
            >
              Close request
            </Button>
          )}
        </section>

        {error && (
          <div className="mb-3">
            <Alert variant="error">{error}</Alert>
          </div>
        )}

        <section className="workspace-card">
          <h2>Offers</h2>
          {isAuthor && open && (
            <p className="text-[13px] text-[var(--nsr-text-secondary)] mb-3">
              Choosing an offer opens the normal booking review with your dates filled in. Nothing is reserved until you
              send the booking.
            </p>
          )}
          {offers.length === 0 ? (
            <p className="text-[14px] text-[var(--nsr-text-secondary)]">No offers yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {offers.map((o) => (
                <li key={o.id} className="rounded-[var(--nsr-radius-md)] border border-[var(--nsr-divider)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-[15px] font-semibold">
                        {o.listing?.isPublic ? (
                          <Link href={`/items/${o.listingId}`} className="hover:underline">
                            {o.listing.titleEn}
                          </Link>
                        ) : (
                          (o.listing?.titleEn ?? "Item no longer listed")
                        )}
                      </p>
                      <p className="text-[12px] text-[var(--nsr-text-secondary)]">
                        Offered by {o.ownerName}
                        {o.listing
                          ? ` · ${o.listing.lendingMode === "free" ? "Free" : `${formatSar(o.listing.dailyRateHalalas)}/day`}${
                              o.listing.depositHalalas ? ` + ${formatSar(o.listing.depositHalalas)} refundable deposit` : ""
                            }`
                          : ""}
                        {o.status === "selected" ? " · chosen" : ""}
                        {o.bookingId ? " · booking made" : ""}
                      </p>
                      {o.message && <p className="mt-1 text-[14px]">{o.message}</p>}
                    </div>
                    <div className="flex gap-2">
                      {isAuthor && open && o.listing?.isPublic && !o.bookingId && (
                        <Button size="sm" loading={busy === o.id} onClick={() => choose(o.id)}>
                          {o.status === "selected" ? "Continue to booking" : "Choose offer"}
                        </Button>
                      )}
                      {o.ownerUid === user?.uid && !o.bookingId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={busy === `w-${o.id}`}
                          onClick={() => run(`w-${o.id}`, () => withdrawOffer(id, o.id))}
                        >
                          Withdraw
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {user && !isAuthor && open && (
            <div className="mt-5 border-t border-[var(--nsr-divider)] pt-4">
              <h3 className="text-[15px] font-semibold mb-2">Offer one of your items</h3>
              {myListings.length === 0 ? (
                <p className="text-[13px] text-[var(--nsr-text-secondary)]">
                  You need a published listing to make an offer.{" "}
                  <Link href="/listings/new" className="underline">
                    List an item
                  </Link>
                </p>
              ) : (
                <>
                  <label className="booking-field mb-2">
                    <span>Your listing</span>
                    <select value={listingId} onChange={(e) => setListingId(e.target.value)}>
                      <option value="">Choose...</option>
                      {myListings
                        .filter((l) => !myOffers.some((o) => o.listingId === l.id))
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.titleEn}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label className="booking-field mb-2">
                    <span>Message (optional)</span>
                    <textarea rows={2} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
                  </label>
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      disabled={!listingId}
                      loading={busy === "offer"}
                      onClick={() =>
                        run("offer", async () => {
                          const res = await offerListing(id, listingId, message.trim());
                          if (!res.error) {
                            setListingId("");
                            setMessage("");
                          }
                          return res;
                        })
                      }
                    >
                      Make offer
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}
          {!user && open && (
            <p className="mt-4 text-[13px]">
              <Link href={`/sign-in?return=/requests/${id}`} className="underline">
                Sign in
              </Link>{" "}
              to offer one of your items.
            </p>
          )}
        </section>
      </div>
    </ContentContainer>
  );
}
