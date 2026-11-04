"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { ContentContainer } from "@/components/layout/content-container";
import { PageHeading } from "@/components/layout/page-heading";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Menu } from "@/components/ui/menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { CalendarDays, MoreVertical, Package, Pencil, Plus } from "lucide-react";
import { useAuth } from "@/features/auth/auth-context";
import {
  fetchMyListings,
  publishListing,
  pauseListing,
  archiveListing,
  type OwnerListing,
} from "@/features/listings/listings-api";

type StatusFilter = "all" | "published" | "draft" | "paused" | "archived";

export default function MyListingsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [listings, setListings] = useState<OwnerListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [actionError, setActionError] = useState<string | null>(null);
  const [, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/sign-in?return=/my-listings");
    }
  }, [authLoading, user, router]);

  const loadListings = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    const res = await fetchMyListings(statusFilter);
    setLoading(false);
    if (res.data) {
      setListings(res.data.items);
    } else if (res.error) {
      setError(res.error.message);
    }
  }, [user, statusFilter]);

  useEffect(() => {
    if (user) loadListings();
  }, [user, loadListings]);

  const handlePublish = async (listing: OwnerListing) => {
    setActionLoading(listing.id);
    setActionError(null);
    const res = await publishListing(listing.id, listing.revision);
    setActionLoading(null);
    if (res.data) {
      loadListings();
    } else {
      setActionError(res.error?.message ?? "Failed to publish");
    }
  };

  const handlePause = async (listing: OwnerListing) => {
    setActionLoading(listing.id);
    setActionError(null);
    const res = await pauseListing(listing.id, listing.revision);
    setActionLoading(null);
    if (res.data) {
      loadListings();
    } else {
      setActionError(res.error?.message ?? "Failed to pause");
    }
  };

  const handleArchive = async (listing: OwnerListing) => {
    if (!confirm(`Archive "${listing.titleEn}"? This cannot be undone.`))
      return;
    setActionLoading(listing.id);
    setActionError(null);
    const res = await archiveListing(listing.id, listing.revision);
    setActionLoading(null);
    if (res.data) {
      loadListings();
    } else {
      setActionError(res.error?.message ?? "Failed to archive");
    }
  };

  if (authLoading) {
    return (
      <ContentContainer>
        <div className="py-8">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </div>
      </ContentContainer>
    );
  }

  if (!user) return null;

  const filters: StatusFilter[] = [
    "all",
    "published",
    "draft",
    "paused",
    "archived",
  ];

  return (
    <ContentContainer>
      <PageHeading
        title="Your shared items"
        subtitle="A home for everything you lend and rent to neighbors."
        action={
          <Button onClick={() => router.push("/listings/new")}>
            <Plus className="h-4 w-4 mr-1" />
            List an item
          </Button>
        }
      />

      {error && (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
      {actionError && (
        <div className="mb-4">
          <Alert variant="error">{actionError}</Alert>
        </div>
      )}

      <div
        className="flex flex-wrap gap-2 mb-6"
        role="group"
        aria-label="Filter listings by status"
      >
        {filters.map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={`px-3 py-1.5 text-[13px] font-medium rounded-full capitalize transition-colors duration-[var(--nsr-transition-fast)] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nsr-focus)] ${
              statusFilter === f
                ? "bg-[var(--nsr-primary)] text-white border border-[var(--nsr-primary)]"
                : "bg-white border border-[var(--nsr-divider)] text-[var(--nsr-text)] hover:bg-[var(--nsr-selected-background)]"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : listings.length === 0 ? (
        <div className="bg-[var(--nsr-surface)] rounded-[var(--nsr-radius-lg)] border border-[var(--nsr-divider)]">
          <EmptyState
            title="No listings yet"
            description="Start by listing an item you'd like to lend or rent to neighbors."
            action={
              <Button onClick={() => router.push("/listings/new")}>
                List an item
              </Button>
            }
          />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {listings.map((listing) => (
            <div
              key={listing.id}
              className="flex items-center gap-4 bg-[var(--nsr-surface)] rounded-[var(--nsr-radius-lg)] border border-[var(--nsr-divider)] px-4 py-4 transition-colors duration-200 hover:border-[var(--nsr-primary)]"
            >
              <span className="hidden sm:grid h-14 w-14 shrink-0 place-items-center rounded-[14px] bg-[var(--nsr-selected-background)] text-[var(--nsr-primary)]">
                <Package size={24} strokeWidth={1.5} />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-[15px] font-medium text-[var(--nsr-text)] truncate">
                    {listing.titleEn}
                  </h3>
                  <StatusBadge status={listing.status} />
                </div>
                <p className="text-[13px] text-[var(--nsr-text-secondary)]">
                  {listing.lendingMode === "free"
                    ? "Free"
                    : `SAR ${(listing.dailyRateHalalas / 100).toFixed(0)}/day`}
                  {listing.depositHalalas > 0 &&
                    ` · Deposit SAR ${(listing.depositHalalas / 100).toFixed(0)}`}
                </p>
              </div>
              {listing.status !== "archived" && (
                <a
                  href={`/listings/${listing.id}/availability`}
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 text-[14px] font-medium text-[var(--nsr-primary)] border border-[var(--nsr-divider)] rounded-[var(--nsr-radius-md)] hover:bg-[var(--nsr-selected-background)] transition-colors shrink-0"
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Availability
                </a>
              )}
              <a
                href={`/listings/${listing.id}/edit`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[14px] font-medium text-[var(--nsr-primary)] border border-[var(--nsr-primary)] rounded-[var(--nsr-radius-md)] hover:bg-[var(--nsr-selected-background)] transition-colors shrink-0"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </a>
              {listing.status !== "archived" && (
                <Menu
                  trigger={<MoreVertical className="h-4 w-4" />}
                  items={[
                    ...(listing.status === "draft" ||
                    listing.status === "paused"
                      ? [
                          {
                            label: "Publish",
                            onClick: () => handlePublish(listing),
                          },
                        ]
                      : []),
                    ...(listing.status === "published"
                      ? [
                          {
                            label: "Pause",
                            onClick: () => handlePause(listing),
                          },
                        ]
                      : []),
                    {
                      label: "Archive",
                      onClick: () => handleArchive(listing),
                      danger: true,
                    },
                  ]}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </ContentContainer>
  );
}
