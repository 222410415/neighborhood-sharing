"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ellipsis, PackageCheck } from "lucide-react";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { ImageFrame } from "@/components/ui/image-frame";
import { Menu } from "@/components/ui/menu";
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
  const router = useRouter();
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
          <Skeleton className="aspect-[16/10] w-full !rounded-[20px]" />
          <Skeleton className="h-96 w-full !rounded-[22px]" />
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
          <Link href="/" className="primary-link">
            Explore items
          </Link>
        </div>
      </div>
    );

  const isOwner = listing.isOwner;
  const location = listing.neighborhood?.nameEn ?? "Riyadh";
  const condition = listing.condition.charAt(0).toUpperCase() + listing.condition.slice(1);
  const moreOptions = [
    { label: "Browse similar items", onClick: () => router.push(`/?category=${listing.categoryId}`) },
    ...(user && !isOwner
      ? [
          { label: "Set an availability alert", onClick: () => router.push("/favorites") },
          { label: "Report this listing", onClick: () => router.push(`/reports/new?type=listing&id=${listing.id}`) },
        ]
      : []),
  ];
  return (
    <div className="detail-shell">
      <Link href="/" className="back-link">
        <ArrowLeft size={15} aria-hidden="true" /> Back to explore
      </Link>
      <div className="detail-grid">
        <article className="detail-main">
          <div className="detail-media">
            {listing.primaryMediaId && !isDemoPlaceholderMedia(listing.primaryMediaId) ? (
              <ImageFrame
                src={getPublicMediaUrl(listing.primaryMediaId, "main")}
                alt={listing.titleEn}
                aspectRatio="video"
                className="!rounded-none !aspect-auto h-full"
              />
            ) : (
              <div className="detail-fallback">
                <PackageCheck size={64} strokeWidth={1.2} aria-hidden="true" />
              </div>
            )}
            <Link href="/" className="detail-media-back" aria-label="Back to explore">
              <span className="photo-action">
                <ArrowLeft size={20} aria-hidden="true" />
              </span>
            </Link>
            <div className="detail-media-actions">
              {user && !isOwner && <SaveButton listingId={listing.id} />}
              <Menu
                label="More options"
                triggerClassName="photo-action"
                trigger={<Ellipsis size={20} aria-hidden="true" />}
                items={moreOptions}
              />
            </div>
          </div>
          <div className="detail-head">
            <h1 className="detail-title">{listing.titleEn}</h1>
            <p className="detail-sub">
              {location}, Riyadh. {condition} condition.
            </p>
          </div>
          <Link href={`/members/${listing.ownerId}`} className="owner-row">
            <AvatarInitials name={listing.owner.displayName} size="md" />
            <div>
              <strong>{listing.owner.displayName}</strong>
              <span>Shared by your neighbor</span>
            </div>
          </Link>
          <p className="detail-copy">
            {listing.descriptionEn}
            {listing.includedAccessories.length > 0 && ` Includes: ${listing.includedAccessories.join(", ")}.`}
          </p>
          {(listing.titleAr || listing.descriptionAr) && (
            <details className="detail-translation">
              <summary>Read in Arabic</summary>
              <div dir="rtl" lang="ar">
                {listing.titleAr && <p className="font-medium">{listing.titleAr}</p>}
                {listing.descriptionAr && <p>{listing.descriptionAr}</p>}
              </div>
            </details>
          )}
        </article>
        <aside className="term-card" aria-label="Book this item">
          <div className="term-price-row">
            <div className="term-price">
              {listing.lendingMode === "free" ? (
                "Free"
              ) : (
                <>
                  SAR {(listing.dailyRateHalalas / 100).toFixed(0)} <small>/ day</small>
                </>
              )}
            </div>
          </div>
          <BookingPanel
            listingId={listing.id}
            listingTitle={listing.titleEn}
            ownerName={listing.owner.displayName.split(" ")[0] ?? "the owner"}
            signedIn={!!user}
            isOwner={isOwner}
            lendingMode={listing.lendingMode}
            dailyRateHalalas={listing.dailyRateHalalas}
            depositHalalas={listing.depositHalalas}
            initialFrom={typeof query.from === "string" ? query.from : undefined}
            initialTo={typeof query.to === "string" ? query.to : undefined}
            requestOfferId={typeof query.offer === "string" ? query.offer : undefined}
          />
        </aside>
        <div className="detail-related">
          <RelatedItems listingId={listing.id} viewerKey={user?.uid ?? "visitor"} />
        </div>
      </div>
    </div>
  );
}
