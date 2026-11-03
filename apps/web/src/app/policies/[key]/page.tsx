"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ContentContainer } from "@/components/layout/content-container";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PolicyAssistant } from "@/features/ai/components/policy-assistant";
import { fetchPolicy, publishPolicy, type Policy } from "@/features/ai/ai-api";
import { useRoles } from "@/features/roles/use-roles";
import { errorText } from "@/lib/api-client";
import { formatDate } from "@/lib/format";

export default function PolicyPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const roles = useRoles();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetchPolicy(key).then((res) => {
      if (res.data) setPolicy(res.data);
      else setNotFound(true);
    });
  }, [key]);

  if (notFound) {
    return (
      <ContentContainer>
        <Link href="/policies" className="back-link">
          <ArrowLeft size={15} /> All policies
        </Link>
        <div className="catalogue-state">
          <h1 className="section-title">Policy not found</h1>
        </div>
      </ContentContainer>
    );
  }
  if (!policy) return <ContentContainer><Skeleton className="h-64 w-full" /></ContentContainer>;

  const publish = async () => {
    if (!confirm(`Record the team's approval of "${policy.titleEn}" version ${policy.version}?`)) return;
    setBusy(true);
    const res = await publishPolicy(policy.id);
    setBusy(false);
    if (res.data) {
      setPolicy(res.data);
      setMessage("Approval recorded. This version is now the published policy.");
    } else setMessage(errorText(res.error, "The approval could not be recorded."));
  };

  return (
    <ContentContainer>
      <Link href="/policies" className="back-link">
        <ArrowLeft size={15} /> All policies
      </Link>
      <div className="detail-grid !gap-4 !items-start">
        <article className="workspace-card">
          <p className="detail-kicker !mt-0">
            Version {policy.version} · {policy.isDemoDraft ? "Demonstration draft" : `Approved ${formatDate(policy.approvedAt)}`}
          </p>
          <h1 className="detail-title !text-[34px]">{policy.titleEn}</h1>
          {policy.isDemoDraft && (
            <div className="mb-4">
              <Alert variant="warning">
                This policy is a demonstration draft awaiting the team&apos;s approval. It is not a real platform rule.
              </Alert>
            </div>
          )}
          <p className="text-[15px] leading-7">{policy.bodyEn}</p>
          <hr className="my-5 border-[var(--nsr-divider)]" />
          <h2 className="text-[18px] mb-2" dir="rtl">
            {policy.titleAr}
          </h2>
          <p className="text-[15px] leading-7" dir="rtl" lang="ar">
            {policy.bodyAr}
          </p>
          {roles?.isAdmin && policy.isDemoDraft && (
            <div className="mt-5 border-t border-[var(--nsr-divider)] pt-4">
              <p className="text-[13px] mb-2">Admins: publish only after the team has approved this text.</p>
              <Button size="sm" variant="secondary" loading={busy} onClick={publish}>
                Record team approval
              </Button>
            </div>
          )}
          {message && <p className="mt-3 text-[13px]">{message}</p>}
        </article>
        <PolicyAssistant />
      </div>
    </ContentContainer>
  );
}
