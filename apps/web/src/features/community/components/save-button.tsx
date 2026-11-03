"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart } from "lucide-react";
import { fetchFavorites, removeFavorite, saveFavorite } from "@/features/community/community-api";

/** Save or unsave an item. Saving is private and never reserves anything. */
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
    <div className="mt-3 flex items-center gap-3 text-[13px]">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={saved}
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--nsr-control-outline)] px-3 py-1.5 font-semibold text-[var(--nsr-primary)] hover:bg-[var(--nsr-selected-background)] disabled:opacity-60"
      >
        <Heart size={14} className={saved ? "fill-[var(--nsr-primary)]" : ""} aria-hidden="true" />
        {saved ? "Saved" : "Save"}
      </button>
      {saved && (
        <Link href="/favorites" className="text-[var(--nsr-link)] hover:underline">
          Set an availability alert
        </Link>
      )}
    </div>
  );
}
