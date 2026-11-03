"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ContentContainer } from "@/components/layout/content-container";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert } from "@/components/ui/alert";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-context";
import { fetchConversations, type Conversation } from "@/features/messages/messages-api";
import { errorText } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";
import { usePolling } from "@/lib/use-polling";

export default function MessagesPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/sign-in?return=/messages");
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    const res = await fetchConversations();
    setLoading(false);
    if (res.data) {
      setItems(res.data.items);
      setError(null);
      return true;
    }
    setError(errorText(res.error, "Conversations could not be loaded."));
    return false;
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  usePolling(load, 30_000, !!user);

  if (authLoading || !user || loading) {
    return (
      <ContentContainer>
        <Skeleton className="h-10 w-48 mb-6" />
        <Skeleton className="h-20 w-full mb-2" />
        <Skeleton className="h-20 w-full" />
      </ContentContainer>
    );
  }

  return (
    <ContentContainer>
      <PageHeading title="Messages" subtitle="Conversations about items and bookings. Text only." />
      {error && (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
      {items.length === 0 ? (
        <div className="workspace-card">
          <EmptyState
            title="No conversations yet"
            description="Use Ask the owner on an item page, or message the other member from a booking."
            action={
              <Link href="/" className="header-cta">
                Explore items
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((c) => (
            <li key={c.id}>
              <Link
                href={`/messages/${encodeURIComponent(c.id)}`}
                className="flex items-center gap-4 bg-[var(--nsr-surface)] rounded-[var(--nsr-radius-lg)] border border-[var(--nsr-divider)] px-4 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              >
                <AvatarInitials name={c.otherMember.displayName} size="md" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-[15px] truncate ${c.unread ? "font-bold" : "font-medium"}`}>
                      {c.otherMember.displayName}
                    </p>
                    {c.unread && (
                      <span className="rounded-full bg-[var(--nsr-primary)] px-2 py-0.5 text-[11px] font-bold text-white">
                        New
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] text-[var(--nsr-text-secondary)] truncate">{c.contextTitle}</p>
                  <p className={`text-[13px] truncate ${c.unread ? "text-[var(--nsr-text)]" : "text-[var(--nsr-text-secondary)]"}`}>
                    {c.lastMessagePreview
                      ? `${c.lastMessageSenderUid === user.uid ? "You: " : ""}${c.lastMessagePreview}`
                      : "No messages yet"}
                  </p>
                </div>
                {c.lastMessageAt && (
                  <span className="hidden sm:block shrink-0 text-[12px] text-[var(--nsr-text-secondary)]">
                    {formatDateTime(c.lastMessageAt)}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ContentContainer>
  );
}
