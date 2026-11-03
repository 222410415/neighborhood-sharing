"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ContentContainer } from "@/components/layout/content-container";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { PolicyAssistant } from "@/features/ai/components/policy-assistant";
import { fetchPolicies, type PolicySummary } from "@/features/ai/ai-api";
import { errorText } from "@/lib/api-client";

export default function PoliciesPage() {
  const [items, setItems] = useState<PolicySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPolicies().then((res) => {
      if (res.data) setItems(res.data.items);
      else setError(errorText(res.error, "Policies could not be loaded."));
    });
  }, []);

  const anyDraft = items?.some((p) => p.isDemoDraft);

  return (
    <ContentContainer>
      <PageHeading title="Policies" subtitle="How borrowing, lending, deposits and disputes work on the platform." />
      {anyDraft && (
        <div className="mb-4">
          <Alert variant="warning" title="Demonstration drafts">
            Policies marked as drafts await the team&apos;s approval. They describe the demonstration and are not real
            platform rules.
          </Alert>
        </div>
      )}
      <div className="detail-grid !gap-4 !items-start">
        <div>
          {error && <Alert variant="error">{error}</Alert>}
          {!items && !error ? (
            <Skeleton className="h-64 w-full" />
          ) : items && items.length === 0 ? (
            <div className="workspace-card">
              <p className="text-[14px]">No policies have been loaded yet.</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {items?.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/policies/${p.policyKey}`}
                    className="flex items-center justify-between gap-3 bg-[var(--nsr-surface)] rounded-[var(--nsr-radius-lg)] border border-[var(--nsr-divider)] px-4 py-3 hover:shadow-md transition-shadow"
                  >
                    <span>
                      <span className="block text-[15px] font-semibold">{p.titleEn}</span>
                      <span className="block text-[13px] text-[var(--nsr-text-secondary)]" dir="rtl">
                        {p.titleAr}
                      </span>
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        p.isDemoDraft
                          ? "bg-[var(--nsr-warning-background)] text-[var(--nsr-warning)]"
                          : "bg-[var(--nsr-success-background)] text-[var(--nsr-success)]"
                      }`}
                    >
                      {p.isDemoDraft ? `Draft ${p.version}` : `Approved ${p.version}`}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <PolicyAssistant />
      </div>
    </ContentContainer>
  );
}
