"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellOff, Heart, Trash2 } from "lucide-react";
import { ContentContainer } from "@/components/layout/content-container";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-context";
import { fetchFavorites, removeFavorite, saveFavorite, type Favorite } from "@/features/community/community-api";
import { errorText } from "@/lib/api-client";
import { formatDateTime, formatSar, isoToRiyadhLocal, riyadhLocalToIso } from "@/lib/format";

function FavoriteRow({ fav, onChanged }: { fav: Favorite; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [from, setFrom] = useState(fav.desiredStartAt ? isoToRiyadhLocal(fav.desiredStartAt) : "");
  const [to, setTo] = useState(fav.desiredEndAt ? isoToRiyadhLocal(fav.desiredEndAt) : "");
  const [alerts, setAlerts] = useState(fav.alertEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (alerts && (!from || !to)) {
      setError("Choose the dates you want to be alerted about.");
      return;
    }
    setBusy(true);
    const res = await saveFavorite(fav.listingId, {
      alertEnabled: alerts,
      desiredStartAt: from && to ? riyadhLocalToIso(from) : null,
      desiredEndAt: from && to ? riyadhLocalToIso(to) : null,
    });
    setBusy(false);
    if (res.error) setError(errorText(res.error, "Could not save."));
    else {
      setEditing(false);
      onChanged();
    }
  };

  const remove = async () => {
    setBusy(true);
    await removeFavorite(fav.listingId);
    setBusy(false);
    onChanged();
  };

  const status = !fav.listing.isPublic
    ? "No longer listed"
    : fav.availableForDates === null
      ? "Listed"
      : fav.availableForDates
        ? "Free for your dates"
        : "Booked or unavailable for your dates";

  return (
    <li className="workspace-card !mb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {fav.listing.isPublic ? (
            <Link href={`/items/${fav.listingId}`} className="text-[16px] font-semibold hover:underline">
              {fav.listing.titleEn}
            </Link>
          ) : (
            <p className="text-[16px] font-semibold">{fav.listing.titleEn}</p>
          )}
          <p className="text-[13px] text-[var(--nsr-text-secondary)]">
            {fav.listing.neighborhoodName} ·{" "}
            {fav.listing.lendingMode === "free" ? "Free" : `${formatSar(fav.listing.dailyRateHalalas)} / day`}
          </p>
          <p className="mt-1 text-[13px] font-semibold">{status}</p>
          {fav.desiredStartAt && fav.desiredEndAt && (
            <p className="text-[12px] text-[var(--nsr-text-secondary)]">
              Your dates: {formatDateTime(fav.desiredStartAt)} to {formatDateTime(fav.desiredEndAt)}
            </p>
          )}
          <p className="text-[12px] text-[var(--nsr-text-secondary)] inline-flex items-center gap-1">
            {fav.alertEnabled ? <Bell size={12} /> : <BellOff size={12} />}
            {fav.alertEnabled ? "Alert on: you get one notice when these dates become free" : "No alert"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={() => setEditing(!editing)}>
            Alert settings
          </Button>
          <Button size="sm" variant="ghost" loading={busy} onClick={remove} aria-label={`Remove ${fav.listing.titleEn}`}>
            <Trash2 size={14} />
          </Button>
        </div>
      </div>
      {editing && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="booking-field">
            <span>From (Riyadh time)</span>
            <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="booking-field">
            <span>Until (Riyadh time)</span>
            <input type="datetime-local" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-[14px] sm:col-span-2">
            <input type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} />
            Tell me once if these dates become free
          </label>
          {error && (
            <div className="sm:col-span-2">
              <Alert variant="error">{error}</Alert>
            </div>
          )}
          <div className="sm:col-span-2 flex justify-end">
            <Button size="sm" loading={busy} onClick={save}>
              Save alert settings
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export default function FavoritesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<Favorite[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/sign-in?return=/favorites");
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    const res = await fetchFavorites();
    if (res.data) setItems(res.data.items);
    else setError(errorText(res.error, "Saved items could not be loaded."));
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  return (
    <ContentContainer>
      <PageHeading
        title="Saved items"
        subtitle="Saving is private and does not reserve anything. Add dates to get one alert when they become free."
      />
      {error && <Alert variant="error">{error}</Alert>}
      {!items && !error ? (
        <Skeleton className="h-32 w-full" />
      ) : items && items.length === 0 ? (
        <div className="workspace-card">
          <EmptyState
            title="Nothing saved yet"
            description="Use Save on an item page to keep it here."
            action={
              <Link href="/" className="header-cta">
                <Heart size={15} /> Explore items
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items?.map((f) => <FavoriteRow key={f.id} fav={f} onChanged={load} />)}
        </ul>
      )}
    </ContentContainer>
  );
}
