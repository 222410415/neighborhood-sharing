"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ContentContainer } from "@/components/layout/content-container";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ImageUpload } from "@/components/ui/image-upload";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-context";
import {
  CATEGORY_LABELS,
  createReport,
  type ReportCategory,
  type ReportTargetType,
} from "@/features/trust/trust-api";
import { errorText } from "@/lib/api-client";
import { newClientId } from "@/lib/format";

const TARGET_LABELS: Record<ReportTargetType, string> = {
  listing: "this listing",
  message: "this message",
  review: "this review",
  member: "this member",
};

function NewReportContent() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const type = params.get("type") as ReportTargetType | null;
  const targetId = params.get("id") ?? "";
  const bookingId = params.get("booking") ?? undefined;
  const validType = type && ["listing", "message", "review", "member"].includes(type);

  const [category, setCategory] = useState<ReportCategory | "">("");
  const [description, setDescription] = useState("");
  const [mediaIds, setMediaIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const requestId = useRef(newClientId("report"));

  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/sign-in?return=${encodeURIComponent(`/reports/new?${params.toString()}`)}`);
    }
  }, [authLoading, user, router, params]);

  if (authLoading || !user) {
    return (
      <ContentContainer>
        <Skeleton className="h-64 w-full max-w-2xl mx-auto" />
      </ContentContainer>
    );
  }

  if (!validType || !targetId) {
    return (
      <ContentContainer>
        <div className="max-w-2xl mx-auto">
          <Alert variant="error">Open the report form from the listing, message, review or profile you want to report.</Alert>
        </div>
      </ContentContainer>
    );
  }

  const submit = async () => {
    setError(null);
    if (!category) {
      setError("Choose what kind of problem it is.");
      return;
    }
    if (!description.trim()) {
      setError("Describe the problem.");
      return;
    }
    setBusy(true);
    const res = await createReport({
      targetType: type!,
      targetId,
      bookingId,
      category,
      description: description.trim(),
      evidenceMediaIds: mediaIds,
      clientRequestId: requestId.current,
    });
    setBusy(false);
    if (res.data) setSubmitted(true);
    else setError(errorText(res.error, "The report could not be sent."));
  };

  return (
    <ContentContainer>
      <div className="max-w-2xl mx-auto">
        <button type="button" onClick={() => router.back()} className="back-link bg-transparent border-0">
          <ArrowLeft size={15} /> Back
        </button>
        <PageHeading
          title={`Report ${TARGET_LABELS[type!]}`}
          subtitle="Reports go to an admin. Reporting does not change or remove anything by itself."
        />
        {submitted ? (
          <Alert variant="success" title="Report sent">
            Thank you. An admin will look at it, and you will get a notification when it is closed.{" "}
            <Link href="/reports" className="underline font-semibold">
              See your reports
            </Link>
          </Alert>
        ) : (
          <section className="workspace-card">
            <label className="booking-field mb-4">
              <span>What kind of problem is it?</span>
              <select value={category} onChange={(e) => setCategory(e.target.value as ReportCategory | "")}>
                <option value="">Choose...</option>
                {(Object.keys(CATEGORY_LABELS) as ReportCategory[]).map((c) => (
                  <option key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="booking-field mb-4">
              <span>What happened?</span>
              <textarea rows={5} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <div className="mb-4">
              <p className="text-[14px] font-semibold mb-2">Evidence photos (optional, up to 3)</p>
              <ImageUpload
                mediaIds={mediaIds}
                onMediaIdsChange={setMediaIds}
                clientSubmissionPrefix={`report-${requestId.current}`}
                purpose="report"
              />
              <p className="mt-1 text-[12px] text-[var(--nsr-text-secondary)]">
                Report photos are private: only the admin handling your report can see them.
              </p>
            </div>
            {error && (
              <div className="mb-3">
                <Alert variant="error">{error}</Alert>
              </div>
            )}
            <div className="flex justify-end">
              <Button loading={busy} onClick={submit}>
                Send report
              </Button>
            </div>
          </section>
        )}
      </div>
    </ContentContainer>
  );
}

export default function NewReportPage() {
  return (
    <Suspense fallback={<ContentContainer><Skeleton className="h-64 w-full" /></ContentContainer>}>
      <NewReportContent />
    </Suspense>
  );
}
