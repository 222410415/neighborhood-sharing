"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { ArrowLeft, Flag, MapPin, PackageCheck, ShieldCheck } from "lucide-react";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { ImageFrame } from "@/components/ui/image-frame";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingPanel } from "@/features/bookings/components/booking-panel";
import { SaveButton } from "@/features/community/components/save-button";
import { RelatedItems } from "@/features/ai/components/suggestions";
import { useAuth } from "@/features/auth/auth-context";
import {
  fetchPublishedDetail,
  type PublicListingDetail,
} from "@/features/listings/public-listings-api";
import {
  getPublicMediaUrl,
  isDemoPlaceholderMedia,
} from "@/features/media/media-api";

export default function ItemDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string; offer?: string }>;
}) {
  const { id } = use(params);
  // Prefilled dates from a chosen community-request offer or an availability alert.
  const query = use(searchParams);
  const { user, loading: authLoading } = useAuth();
  const viewerUid = user?.uid ?? null;
  const [listing, setListing] = useState<PublicListingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  // Wait for the auth state so the API can tell whether the viewer owns the item.
  useEffect(() => {
    if (authLoading) return;
    let active = true;
    fetchPublishedDetail(id).then((data) => {
      if (active) {
        setListing(data);
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [id, authLoading, viewerUid]);

  if (loading)
    return (
      <div className="detail-shell">
        <Skeleton className="h-4 w-24 mb-6" />
        <div className="detail-grid">
          <Skeleton className="aspect-video w-full !rounded-[25px]" />
          <Skeleton className="h-80 w-full !rounded-[23px]" />
        </div>
      </div>
    );
  if (!listing)
    return (
      <div className="detail-shell">
        <Link href="/" className="back-link">
          <ArrowLeft size={15} /> Back to explore
        </Link>
        <div className="catalogue-state">
          <h1 className="section-title">This item isn’t available</h1>
          <p>
            It may have been removed or shared already. Explore what else is
            nearby.
          </p>
          <Link href="/" className="header-cta">
            Explore items
          </Link>
        </div>
      </div>
    );

  const isOwner = listing.isOwner;
  const location = listing.neighborhood?.nameEn ?? "Riyadh";
  return (
    <div className="detail-shell reveal">
      <Link href="/" className="back-link">
        <ArrowLeft size={15} /> Back to explore
      </Link>
      <div className="detail-grid">
        <article>
          <div className="detail-media">
            {listing.primaryMediaId &&
            !isDemoPlaceholderMedia(listing.primaryMediaId) ? (
              <ImageFrame
                src={getPublicMediaUrl(listing.primaryMediaId, "main")}
                alt={listing.titleEn}
                aspectRatio="video"
                className="!rounded-[25px]"
              />
            ) : (
              <div className="aspect-video grid place-items-center text-[#6a8a73]">
                <PackageCheck size={70} strokeWidth={1.2} />
              </div>
            )}
          </div>
          <p className="detail-kicker">
            {listing.category?.nameEn ?? "SHARED LOCALLY"}
          </p>
          <h1 className="detail-title">{listing.titleEn}</h1>
          <div className="detail-location">
            <MapPin size={16} /> {location}, Riyadh
          </div>
          {listing.titleAr && (
            <p className="text-[#65746e] mt-3" dir="rtl">
              {listing.titleAr}
            </p>
          )}
          <section className="detail-section">
            <h2>About this item</h2>
            <p>{listing.descriptionEn}</p>
            {listing.descriptionAr && (
              <p dir="rtl" className="mt-3">
                {listing.descriptionAr}
              </p>
            )}
          </section>
          {listing.includedAccessories.length > 0 && (
            <section className="detail-section">
              <h2>What’s included</h2>
              <div>
                {listing.includedAccessories.map((item) => (
                  <span className="detail-tag" key={item}>
                    {item}
                  </span>
                ))}
              </div>
            </section>
          )}
          <RelatedItems listingId={listing.id} viewerKey={user?.uid ?? "visitor"} />
          <section className="detail-section">
            <h2>Shared by your neighbor</h2>
            <div className="owner-row">
              <AvatarInitials name={listing.owner.displayName} size="md" />
              <div>
                <Link href={`/members/${listing.ownerId}`} className="hover:underline">
                  <strong>{listing.owner.displayName}</strong>
                </Link>
                <span>{location}</span>
              </div>
            </div>
          </section>
        </article>
        <aside className="term-card term-card--static">
          <p className="term-kicker">At a glance</p>
          <div className="term-price">
            {listing.lendingMode === "free" ? (
              "Free"
            ) : (
              <>
                SAR {(listing.dailyRateHalalas / 100).toFixed(0)}{" "}
                <small>/ day</small>
              </>
            )}
          </div>
          <div className="term-divider" />
          <div className="term-line">
            <span>Condition</span>
            <strong className="capitalize">{listing.condition}</strong>
          </div>
          <div className="term-line">
            <span>Neighborhood</span>
            <strong>{location}</strong>
          </div>
          {listing.depositHalalas > 0 && (
            <div className="term-line">
              <span>Refundable deposit</span>
              <strong>SAR {(listing.depositHalalas / 100).toFixed(0)}</strong>
            </div>
          )}
          <div className="term-divider" />
          <div className="flex items-start gap-2 text-[12px] text-[#6b816f]">
            <ShieldCheck size={17} className="shrink-0" />
            <span>See the item and its terms before you make plans.</span>
          </div>
          <div className="term-divider" />
          <BookingPanel
            listingId={listing.id}
            listingTitle={listing.titleEn}
            signedIn={!!user}
            isOwner={isOwner}
            initialFrom={typeof query.from === "string" ? query.from : undefined}
            initialTo={typeof query.to === "string" ? query.to : undefined}
            requestOfferId={typeof query.offer === "string" ? query.offer : undefined}
          />
          {user && !isOwner && <SaveButton listingId={listing.id} />}
          {!isOwner && (
            <Link
              className="term-action term-action--secondary"
              href={`/?category=${listing.categoryId}`}
            >
              Browse similar items
            </Link>
          )}
          {user && !isOwner && (
            <Link
              href={`/reports/new?type=listing&id=${listing.id}`}
              className="mt-3 inline-flex items-center gap-1 text-[12px] text-[#7b8a7e] hover:text-[var(--nsr-error)]"
            >
              <Flag size={12} /> Report this listing
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
