"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, MapPin, Plus } from "lucide-react";
import { ContentContainer } from "@/components/layout/content-container";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-context";
import { fetchMyRequests, fetchOpenRequests, type RequestPost } from "@/features/community/community-api";
import { CATEGORIES } from "@/lib/catalogue-options";
import { errorText } from "@/lib/api-client";
import { formatDate, formatSar } from "@/lib/format";

const STATUS: Record<RequestPost["status"], string> = {
  open: "Open",
  fulfilled: "Fulfilled",
  closed: "Closed",
  expired: "Expired",
};

function RequestCard({ r }: { r: RequestPost }) {
  return (
    <li>
      <Link
        href={`/requests/${r.id}`}
        className="flex items-center gap-4 bg-[var(--nsr-surface)] rounded-[var(--nsr-radius-lg)] border border-[var(--nsr-divider)] px-4 py-4 transition-colors duration-200 hover:border-[var(--nsr-primary)]"
      >
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-semibold">{r.title}</p>
          <p className="text-[13px] text-[var(--nsr-text-secondary)]">
            {CATEGORIES.find((c) => c.id === r.categoryId)?.name ?? "Item"} ·{" "}
            <MapPin size={12} className="inline" /> {r.neighborhoodName} · {formatDate(r.desiredStartAt)} to{" "}
            {formatDate(r.desiredEndAt)}
            {r.maxDailyRateHalalas !== null ? ` · up to ${formatSar(r.maxDailyRateHalalas)}/day` : ""}
          </p>
          <p className="text-[12px] text-[var(--nsr-text-secondary)]">
            {r.authorName} · {r.offerCount} offer{r.offerCount === 1 ? "" : "s"} · {STATUS[r.status]}
          </p>
        </div>
        <ArrowRight size={18} className="shrink-0 text-[var(--nsr-text-secondary)]" />
      </Link>
    </li>
  );
}

export default function RequestsPage() {
  const { user } = useAuth();
  const [open, setOpen] = useState<RequestPost[] | null>(null);
  const [mine, setMine] = useState<RequestPost[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchOpenRequests().then((res) => {
      if (res.data) setOpen(res.data.items);
      else setError(errorText(res.error, "Requests could not be loaded."));
    });
  }, []);

  useEffect(() => {
    if (!user) {
      setMine([]);
      return;
    }
    fetchMyRequests().then((res) => setMine(res.data?.items ?? []));
  }, [user]);

  return (
    <ContentContainer>
      <Link href="/" className="back-link">
        <ArrowLeft size={15} /> Back to explore
      </Link>
      <PageHeading
        title="Community requests"
        subtitle="Neighbors asking for something they need. Have it? Message them directly, even if it is not listed, or offer one of your listed items. Nothing is reserved until a booking is made."
        action={
          <Link href={user ? "/requests/new" : "/sign-in?return=/requests/new"} className="primary-link">
            <Plus size={16} /> Ask for an item
          </Link>
        }
      />
      {error && <Alert variant="error">{error}</Alert>}
      {mine.length > 0 && (
        <section className="mb-6">
          <h2 className="text-[16px] font-semibold mb-2">Your requests</h2>
          <ul className="flex flex-col gap-2">
            {mine.map((r) => (
              <RequestCard key={r.id} r={r} />
            ))}
          </ul>
        </section>
      )}
      <h2 className="text-[16px] font-semibold mb-2">Open requests</h2>
      {!open && !error ? (
        <Skeleton className="h-24 w-full" />
      ) : open && open.length === 0 ? (
        <div className="workspace-card">
          <EmptyState title="No open requests" description="When neighbors ask for something, it appears here." />
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {open?.map((r) => (
            <RequestCard key={r.id} r={r} />
          ))}
        </ul>
      )}
    </ContentContainer>
  );
}
