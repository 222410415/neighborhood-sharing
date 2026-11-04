"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PackageCheck } from "lucide-react";
import { fetchSuggestions, type Suggestions } from "@/features/ai/ai-api";
import { getPublicMediaUrl, isDemoPlaceholderMedia } from "@/features/media/media-api";
import { formatSar } from "@/lib/format";

/** "You might also need": AI-assisted when available, otherwise ordinary same-category suggestions. */
export function RelatedItems({ listingId, viewerKey }: { listingId: string; viewerKey: string }) {
  const [data, setData] = useState<Suggestions | null>(null);

  useEffect(() => {
    let active = true;
    fetchSuggestions(listingId).then((res) => {
      if (active) setData(res.data);
    });
    return () => {
      active = false;
    };
  }, [listingId, viewerKey]);

  if (!data || data.items.length === 0) return null;
  const ai = data.source === "ai";
  return (
    <section className="detail-section" aria-labelledby="related-heading">
      <h2 id="related-heading">{ai ? "You might also need" : "Similar items"}</h2>
      <p className="detail-note">{ai ? data.label : "Other items in the same category nearby."}</p>
      <ul className="related-grid">
        {data.items.map((item) => (
          <li key={item.id}>
            <Link href={`/items/${item.id}`} className="related-card" title={item.reason ?? undefined}>
              <span className="related-card-image">
                {item.primaryMediaId && !isDemoPlaceholderMedia(item.primaryMediaId) ? (
                  <img src={getPublicMediaUrl(item.primaryMediaId, "thumbnail")} alt="" loading="lazy" />
                ) : (
                  <span className="detail-fallback">
                    <PackageCheck size={24} aria-hidden="true" />
                  </span>
                )}
              </span>
              <span>
                <strong>{item.titleEn}</strong>
                <span>{item.lendingMode === "free" ? "Free" : `${formatSar(item.dailyRateHalalas)} / day`}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
