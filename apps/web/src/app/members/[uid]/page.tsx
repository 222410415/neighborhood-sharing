"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Flag, FlaskConical, MapPin } from "lucide-react";
import { ContentContainer } from "@/components/layout/content-container";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Skeleton } from "@/components/ui/skeleton";
import { RatingStars } from "@/features/trust/components/rating-stars";
import { useAuth } from "@/features/auth/auth-context";
import {
  fetchMemberProfile,
  fetchMemberReviews,
  memberPhotoUrl,
  type MemberProfile,
  type Review,
} from "@/features/trust/trust-api";
import { formatDate } from "@/lib/format";

export default function MemberProfilePage({ params }: { params: Promise<{ uid: string }> }) {
  const { uid } = use(params);
  const { user } = useAuth();
  const [profile, setProfile] = useState<MemberProfile | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([fetchMemberProfile(uid), fetchMemberReviews(uid)]).then(([p, r]) => {
      if (!active) return;
      setLoading(false);
      if (!p.data) {
        setNotFound(true);
        return;
      }
      setProfile(p.data);
      setReviews(r.data?.items ?? []);
    });
    return () => {
      active = false;
    };
  }, [uid]);

  if (loading) {
    return (
      <ContentContainer>
        <Skeleton className="h-24 w-full mb-4" />
        <Skeleton className="h-48 w-full" />
      </ContentContainer>
    );
  }
  if (notFound || !profile) {
    return (
      <ContentContainer>
        <Link href="/" className="back-link">
          <ArrowLeft size={15} /> Back to explore
        </Link>
        <div className="catalogue-state">
          <h1 className="section-title">Member not found</h1>
          <p>This profile does not exist or is not public.</p>
        </div>
      </ContentContainer>
    );
  }

  const isMe = user?.uid === uid;

  return (
    <ContentContainer>
      <div className="max-w-3xl mx-auto">
        <section className="workspace-card">
          <div className="flex flex-wrap items-center gap-4">
            {profile.hasPhoto && !photoFailed ? (
              <img
                src={memberPhotoUrl(uid, "thumbnail")}
                alt=""
                className="h-16 w-16 rounded-full object-cover border border-[var(--nsr-divider)]"
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              <AvatarInitials name={profile.displayName} size="lg" />
            )}
            <div className="flex-1 min-w-0">
              <h1 className="font-[Georgia] text-[34px] tracking-[-0.04em] leading-tight">{profile.displayName}</h1>
              <div className="flex flex-wrap items-center gap-3 text-[13px] text-[var(--nsr-text-secondary)]">
                {profile.neighborhoodName && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={13} /> {profile.neighborhoodName}
                  </span>
                )}
                {profile.memberSince && <span>Member since {formatDate(profile.memberSince)}</span>}
              </div>
            </div>
            {isMe ? (
              <Link href="/profile" className="text-[13px] font-semibold text-[var(--nsr-link)]">
                Edit your profile
              </Link>
            ) : user ? (
              <Link
                href={`/reports/new?type=member&id=${encodeURIComponent(uid)}`}
                className="inline-flex items-center gap-1 text-[13px] text-[var(--nsr-text-secondary)] hover:text-[var(--nsr-error)]"
              >
                <Flag size={13} /> Report member
              </Link>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {profile.verificationLabels.length === 0 && (
              <span className="text-[12px] text-[var(--nsr-text-secondary)]">No verification checks yet</span>
            )}
            {profile.verificationLabels.map((l) => (
              <span
                key={l.label}
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                  l.isSimulated
                    ? "bg-[var(--nsr-warning-background)] text-[var(--nsr-warning)]"
                    : "bg-[var(--nsr-success-background)] text-[var(--nsr-success)]"
                }`}
              >
                {l.isSimulated ? <FlaskConical size={13} /> : <BadgeCheck size={13} />} {l.label}
              </span>
            ))}
          </div>
          {profile.biographyEn && <p className="mt-4 text-[14px] text-[#53665a]">{profile.biographyEn}</p>}
        </section>

        <section className="workspace-card" aria-labelledby="reviews-heading">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 id="reviews-heading" className="!mb-0">
              Reviews
            </h2>
            {profile.reputation.reviewCount > 0 ? (
              <span className="inline-flex items-center gap-2 text-[14px]">
                <RatingStars rating={profile.reputation.averageRating ?? 0} />
                <strong>{profile.reputation.averageRating?.toFixed(1)}</strong>
                <span className="text-[var(--nsr-text-secondary)]">
                  from {profile.reputation.reviewCount} review{profile.reputation.reviewCount === 1 ? "" : "s"}
                </span>
              </span>
            ) : (
              <span className="text-[13px] text-[var(--nsr-text-secondary)]">No reviews yet</span>
            )}
          </div>
          <p className="text-[12px] text-[var(--nsr-text-secondary)] mb-3">
            Only members who completed an exchange together can review each other. Ratings are about the person, not
            the item.
          </p>
          {profile.reviewsHidden ? (
            <p className="text-[14px] text-[var(--nsr-text-secondary)]">
              This member keeps review texts private. The rating summary above still counts every visible review.
            </p>
          ) : reviews.length === 0 ? (
            <p className="text-[14px] text-[var(--nsr-text-secondary)]">Nothing here yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {reviews.map((r) => (
                <li key={r.id} className="rounded-[var(--nsr-radius-md)] border border-[var(--nsr-divider)] p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <RatingStars rating={r.rating} size={13} />
                    <span className="text-[13px] font-semibold">{r.authorName}</span>
                    <span className="text-[12px] text-[var(--nsr-text-secondary)]">
                      as {r.recipientRole === "owner" ? "owner" : "borrower"} · {formatDate(r.createdAt)}
                    </span>
                    {user && user.uid !== r.authorUid && (
                      <Link
                        href={`/reports/new?type=review&id=${encodeURIComponent(r.id)}`}
                        className="ml-auto text-[12px] text-[var(--nsr-text-secondary)] hover:text-[var(--nsr-error)]"
                      >
                        Report
                      </Link>
                    )}
                  </div>
                  {r.comment && <p className="mt-1 text-[14px]">{r.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </ContentContainer>
  );
}
