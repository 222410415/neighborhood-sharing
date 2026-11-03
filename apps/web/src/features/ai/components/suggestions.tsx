"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { fetchSuggestions, type Suggestions } from "@/features/ai/ai-api";
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
      <p className="!text-[12px] !leading-normal mb-3 inline-flex items-center gap-1 text-[var(--nsr-text-secondary)]">
        {ai && <Sparkles size={13} aria-hidden="true" />} {ai ? data.label : "Other items in the same category nearby."}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2">
        {data.items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/items/${item.id}`}
              className="block rounded-[var(--nsr-radius-md)] border border-[var(--nsr-divider)] bg-white p-3 hover:shadow-md transition-shadow"
            >
              <p className="text-[14px] font-semibold">{item.titleEn}</p>
              <p className="text-[12px] text-[var(--nsr-text-secondary)]">
                {item.categoryName} · {item.neighborhoodName} ·{" "}
                {item.lendingMode === "free" ? "Free" : `${formatSar(item.dailyRateHalalas)}/day`}
              </p>
              {item.reason && <p className="mt-1 text-[12px]">{item.reason}</p>}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
