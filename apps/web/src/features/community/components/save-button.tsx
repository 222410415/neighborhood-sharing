"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { fetchFavorites, removeFavorite, saveFavorite } from "@/features/community/community-api";

/** Save or unsave an item from its photo. Saving is private and never reserves anything. */
export function SaveButton({ listingId }: { listingId: string }) {
  const [saved, setSaved] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    fetchFavorites().then((res) => {
      if (active) setSaved(!!res.data?.items.some((f) => f.listingId === listingId));
    });
    return () => {
      active = false;
    };
  }, [listingId]);

  const toggle = async () => {
    setBusy(true);
    const res = saved
      ? await removeFavorite(listingId)
      : await saveFavorite(listingId, { alertEnabled: false, desiredStartAt: null, desiredEndAt: null });
    setBusy(false);
    if (!res.error) setSaved(!saved);
  };

  if (saved === null) return null;
  return (
    <button
      type="button"
      className="photo-action"
      onClick={toggle}
      disabled={busy}
      aria-pressed={saved}
      aria-label={saved ? "Saved. Remove from saved items" : "Save this item"}
    >
      <Heart size={19} className={saved ? "fill-[var(--nsr-primary)] text-[var(--nsr-primary)]" : ""} aria-hidden="true" />
    </button>
  );
}
