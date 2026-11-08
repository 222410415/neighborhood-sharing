"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { ContentContainer } from "@/components/layout/content-container";
import { PageHeading } from "@/components/layout/page-heading";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/status-badge";
import { ImageUpload } from "@/components/ui/image-upload";
import { useAuth } from "@/features/auth/auth-context";
import {
  RIYADH_NEIGHBORHOODS,
  CATEGORIES,
  CONDITIONS,
} from "@/lib/catalogue-options";
import {
  fetchMyListing,
  updateListing,
  publishListing,
  pauseListing,
  archiveListing,
  attachListingMedia,
  detachListingMedia,
  type OwnerListing,
} from "@/features/listings/listings-api";
import { errorText } from "@/lib/api-client";

export default function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [listing, setListing] = useState<OwnerListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Form fields
  const [titleEn, setTitleEn] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [neighborhoodId, setNeighborhoodId] = useState("");
  const [condition, setCondition] = useState("");
  const [lendingMode, setLendingMode] = useState<"free" | "paid">("paid");
  const [dailyRate, setDailyRate] = useState("");
  const [deposit, setDeposit] = useState("");
  const [mediaIds, setMediaIds] = useState<string[]>([]);

  const [listingId, setListingId] = useState("");

  useEffect(() => {
    params.then((p) => setListingId(p.id));
  }, [params]);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/sign-in?return=/listings/${listingId}/edit`);
    }
  }, [authLoading, user, router, listingId]);

  // Warn before leaving dirty form
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // Load listing
  useEffect(() => {
    if (!user || !listingId) return;
    (async () => {
      setLoading(true);
      const res = await fetchMyListing(listingId);
      setLoading(false);
      if (res.data) {
        setListing(res.data);
        setTitleEn(res.data.titleEn ?? "");
        setDescriptionEn(res.data.descriptionEn ?? "");
        setCategoryId(res.data.categoryId ?? "");
        setNeighborhoodId(res.data.neighborhoodId ?? "");
        setCondition(res.data.condition ?? "");
        setLendingMode(res.data.lendingMode ?? "paid");
        setDailyRate(
          res.data.dailyRateHalalas
            ? (res.data.dailyRateHalalas / 100).toString()
            : "",
        );
        setDeposit(
          res.data.depositHalalas
            ? (res.data.depositHalalas / 100).toString()
            : "",
        );
        setMediaIds(res.data.mediaIds ?? []);
      } else {
        setError(res.error?.message ?? "Failed to load listing");
      }
    })();
  }, [user, listingId]);

  const handleSave = async () => {
    if (!listing) return;
    setError(null);
    setActionError(null);
    setSaving(true);

    let dailyRateHalalas: number | undefined;
    let depositHalalas: number | undefined;

    if (lendingMode === "paid") {
      const rate = parseFloat(dailyRate);
      if (isNaN(rate) || rate <= 0) {
        setActionError("Daily rate must be a positive number for paid rental");
        setSaving(false);
        return;
      }
      dailyRateHalalas = Math.round(rate * 100);
    } else {
      dailyRateHalalas = 0;
    }

    if (deposit) {
      const dep = parseFloat(deposit);
      depositHalalas = isNaN(dep) ? 0 : Math.round(dep * 100);
    }

    const res = await updateListing(listing.id, {
      titleEn,
      descriptionEn,
      categoryId,
      neighborhoodId,
      condition,
      lendingMode,
      dailyRateHalalas,
      depositHalalas,
      expectedRevision: listing.revision,
    });

    setSaving(false);

    if (res.data) {
      setListing(res.data);
      setDirty(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } else {
      setActionError(errorText(res.error, "Failed to save"));
    }
  };

  // Attach a newly uploaded image to this listing, then reload the listing so
  // its media list and revision are current before the next save or publish.
  const refreshListing = async (id: string) => {
    const fresh = await fetchMyListing(id);
    if (fresh.data) {
      setListing(fresh.data);
      setMediaIds(fresh.data.mediaIds ?? []);
    }
  };

  // Buttons stay disabled while a photo is attached or removed, so Save and
  // Publish always use the listing's current revision.
  const handleImageUploaded = async (mediaId: string) => {
    if (!listing) return;
    setActionError(null);
    setSaving(true);
    try {
      const res = await attachListingMedia(listing.id, [mediaId]);
      if (res.error || (res.data && res.data.attached.length === 0)) {
        setActionError(errorText(res.error, "The image could not be added to this listing"));
      }
      await refreshListing(listing.id);
    } finally {
      setSaving(false);
    }
  };

  const handleImageRemoved = async (mediaId: string) => {
    if (!listing || !listing.mediaIds.includes(mediaId)) return;
    setActionError(null);
    setSaving(true);
    try {
      const res = await detachListingMedia(listing.id, mediaId);
      if (res.error) {
        setActionError(errorText(res.error, "The image could not be removed"));
      }
      await refreshListing(listing.id);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!listing) return;
    setSaving(true);
    setActionError(null);
    const res = await publishListing(listing.id, listing.revision);
    setSaving(false);
    if (res.data) {
      setListing(res.data);
      setDirty(false);
    } else {
      setActionError(errorText(res.error, "Failed to publish"));
    }
  };

  const handlePause = async () => {
    if (!listing) return;
    setSaving(true);
    setActionError(null);
    const res = await pauseListing(listing.id, listing.revision);
    setSaving(false);
    if (res.data) {
      setListing(res.data);
      setDirty(false);
    } else {
      setActionError(errorText(res.error, "Failed to pause"));
    }
  };

  const handleArchive = async () => {
    if (!listing) return;
    if (!confirm(`Archive "${listing.titleEn}"? This cannot be undone.`))
      return;
    setSaving(true);
    setActionError(null);
    const res = await archiveListing(listing.id, listing.revision);
    setSaving(false);
    if (res.data) {
      setListing(res.data);
      setDirty(false);
    } else {
      setActionError(errorText(res.error, "Failed to archive"));
    }
  };

  if (authLoading || loading) {
    return (
      <ContentContainer>
        <div className="max-w-3xl mx-auto py-8">
          <p className="text-[15px] text-[var(--nsr-text-secondary)]">
            Loading...
          </p>
        </div>
      </ContentContainer>
    );
  }

  if (!user || !listing) {
    return (
      <ContentContainer>
        <div className="max-w-3xl mx-auto py-8">
          {error && <Alert variant="error">{error}</Alert>}
        </div>
      </ContentContainer>
    );
  }

  const isArchived = listing.status === "archived";
  const canPublish = listing.status === "draft" || listing.status === "paused";
  const canPause = listing.status === "published";

  return (
    <ContentContainer>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <PageHeading
            title="Edit your listing"
            subtitle="Keep the details clear and photos up to date."
          />
          <StatusBadge status={listing.status} />
          {!isArchived && (
            <Link
              href={`/listings/${listing.id}/availability`}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-[14px] font-medium text-[var(--nsr-primary)] border border-[var(--nsr-primary)] rounded-[var(--nsr-radius-md)] hover:bg-[var(--nsr-selected-background)]"
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Manage availability
            </Link>
          )}
        </div>

        {saved && (
          <div className="mb-4">
            <Alert variant="success" title="Changes saved">
              Your listing has been updated.
            </Alert>
          </div>
        )}

        {/* Item information */}
        <section className="form-section">
          <h2>Item information</h2>
          <div className="flex flex-col gap-4">
            <Field
              label="Title"
              name="titleEn"
              value={titleEn}
              required
              disabled={isArchived}
              onChange={(e) => {
                setTitleEn(e.target.value);
                setDirty(true);
              }}
            />
            <Field
              label="Description"
              multiline
              name="descriptionEn"
              value={descriptionEn}
              required
              disabled={isArchived}
              onChange={(e) => {
                setDescriptionEn(e.target.value);
                setDirty(true);
              }}
            />
            <Select
              label="Category"
              name="categoryId"
              required
              value={categoryId}
              disabled={isArchived}
              onChange={(e) => {
                setCategoryId(e.target.value);
                setDirty(true);
              }}
            >
              <option value="">Select a category</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              label="Condition"
              name="condition"
              required
              value={condition}
              disabled={isArchived}
              onChange={(e) => {
                setCondition(e.target.value);
                setDirty(true);
              }}
            >
              <option value="">Select condition</option>
              {CONDITIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </section>

        {/* Images */}
        <section className="form-section">
          <h2>Images</h2>
          {!isArchived && (
            <>
              <p className="text-[14px] text-[var(--nsr-text-secondary)] mb-4">
                Up to 3 images. At least one is required to publish.
              </p>
              <ImageUpload
                mediaIds={mediaIds}
                onMediaIdsChange={setMediaIds}
                clientSubmissionPrefix={`listing-${listing.id}`}
                onUploaded={handleImageUploaded}
                onRemoved={handleImageRemoved}
                onBusyChange={setPhotoBusy}
              />
            </>
          )}
          {isArchived && (
            <p className="text-[14px] text-[var(--nsr-text-secondary)]">
              Images cannot be changed for archived listings.
            </p>
          )}
        </section>

        {/* Pricing */}
        <section className="form-section">
          <h2>Pricing</h2>
          <div className="flex flex-col gap-4">
            <div className="choice-row">
              <label className="choice-card">
                <input
                  type="radio"
                  name="lendingMode"
                  value="free"
                  checked={lendingMode === "free"}
                  disabled={isArchived}
                  onChange={() => {
                    setLendingMode("free");
                    setDailyRate("");
                    setDirty(true);
                  }}
                />
                <span className="text-[15px] text-[var(--nsr-text)]">
                  Free lending
                </span>
              </label>
              <label className="choice-card">
                <input
                  type="radio"
                  name="lendingMode"
                  value="paid"
                  checked={lendingMode === "paid"}
                  disabled={isArchived}
                  onChange={() => {
                    setLendingMode("paid");
                    setDirty(true);
                  }}
                />
                <span className="text-[15px] text-[var(--nsr-text)]">
                  Paid rental
                </span>
              </label>
            </div>
            {lendingMode === "paid" && (
              <Field
                label="Daily rate (SAR)"
                name="dailyRate"
                type="number"
                value={dailyRate}
                disabled={isArchived}
                onChange={(e) => {
                  setDailyRate(e.target.value);
                  setDirty(true);
                }}
              />
            )}
            <Field
              label="Refundable deposit (SAR, optional)"
              name="deposit"
              type="number"
              value={deposit}
              disabled={isArchived}
              onChange={(e) => {
                setDeposit(e.target.value);
                setDirty(true);
              }}
            />
            {lendingMode === "free" && deposit && parseFloat(deposit) > 0 && (
              <p className="text-[13px] text-[var(--nsr-text-secondary)]">
                Free to borrow with a refundable deposit of SAR {deposit}.
              </p>
            )}
          </div>
        </section>

        {/* Location */}
        <section className="form-section">
          <h2>Location</h2>
          <Select
            label="Neighborhood"
            name="neighborhoodId"
            required
            value={neighborhoodId}
            disabled={isArchived}
            onChange={(e) => {
              setNeighborhoodId(e.target.value);
              setDirty(true);
            }}
          >
            <option value="">Select a neighborhood</option>
            {RIYADH_NEIGHBORHOODS.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </Select>
        </section>

        {/* Actions */}
        {actionError && (
          <div className="mb-4">
            <Alert variant="error">{actionError}</Alert>
          </div>
        )}
        {!isArchived && (
          <div className="flex flex-wrap justify-end gap-3">
            {canPause && (
              <Button
                variant="secondary"
                loading={saving}
                disabled={photoBusy}
                onClick={handlePause}
              >
                Pause
              </Button>
            )}
            {canPublish && (
              <Button
                variant="secondary"
                loading={saving}
                disabled={photoBusy}
                onClick={handlePublish}
              >
                Publish
              </Button>
            )}
            <Button loading={saving} disabled={photoBusy} onClick={handleSave}>
              Save changes
            </Button>
            <Button variant="secondary" disabled={saving || photoBusy} onClick={handleArchive}>
              Archive
            </Button>
          </div>
        )}
        {isArchived && (
          <div className="flex justify-end">
            <Button
              variant="secondary"
              onClick={() => router.push("/my-listings")}
            >
              Back to My Listings
            </Button>
          </div>
        )}
      </div>
    </ContentContainer>
  );
}
