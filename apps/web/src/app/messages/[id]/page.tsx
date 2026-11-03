"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send } from "lucide-react";
import { ContentContainer } from "@/components/layout/content-container";
import { Alert } from "@/components/ui/alert";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-context";
import {
  fetchConversation,
  fetchMessages,
  markConversationRead,
  sendMessage,
  type Conversation,
  type Message,
} from "@/features/messages/messages-api";
import { announceNotificationsChanged } from "@/features/notifications/notifications-api";
import { errorText } from "@/lib/api-client";
import { formatDateTime, newClientId } from "@/lib/format";
import { usePolling } from "@/lib/use-polling";

const POLL_MS = 5_000;
const MAX_LENGTH = 1000;

interface OutgoingMessage {
  clientMessageId: string;
  body: string;
  status: "sending" | "failed";
}

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = use(params);
  const id = decodeURIComponent(rawId);
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [outbox, setOutbox] = useState<OutgoingMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "denied" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const cursor = useRef<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push(`/sign-in?return=/messages/${encodeURIComponent(id)}`);
  }, [authLoading, user, router, id]);

  const markRead = useCallback(async () => {
    await markConversationRead(id);
    announceNotificationsChanged();
  }, [id]);

  const merge = useCallback((incoming: Message[]) => {
    if (incoming.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      return [...prev, ...incoming.filter((m) => !seen.has(m.id))];
    });
    const delivered = new Set(incoming.map((m) => m.clientMessageId));
    setOutbox((prev) => prev.filter((o) => !delivered.has(o.clientMessageId)));
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const [convRes, msgRes] = await Promise.all([fetchConversation(id), fetchMessages(id)]);
      if (!active) return;
      if (convRes.status === 404 || msgRes.status === 404) {
        setLoadState("denied");
        return;
      }
      if (!convRes.data || !msgRes.data) {
        setLoadError(errorText(convRes.error ?? msgRes.error, "The conversation could not be loaded."));
        setLoadState("error");
        return;
      }
      setConversation(convRes.data);
      setMessages(msgRes.data.items);
      cursor.current = msgRes.data.cursor;
      setLoadState("ready");
      markRead();
    })();
    return () => {
      active = false;
    };
  }, [user, id, markRead]);

  const poll = useCallback(async () => {
    const res = await fetchMessages(id, cursor.current);
    if (!res.data) return false;
    cursor.current = res.data.cursor;
    if (res.data.items.length > 0) {
      merge(res.data.items);
      if (res.data.items.some((m) => m.senderUid !== user?.uid)) markRead();
    }
    return true;
  }, [id, merge, markRead, user?.uid]);

  usePolling(poll, POLL_MS, !!user && loadState === "ready");

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length, outbox.length]);

  const deliver = async (outgoing: OutgoingMessage) => {
    setOutbox((prev) =>
      prev.some((o) => o.clientMessageId === outgoing.clientMessageId)
        ? prev.map((o) => (o.clientMessageId === outgoing.clientMessageId ? { ...o, status: "sending" } : o))
        : [...prev, outgoing],
    );
    const res = await sendMessage(id, outgoing.body, outgoing.clientMessageId);
    if (res.data) {
      merge([res.data]);
    } else {
      setOutbox((prev) =>
        prev.map((o) => (o.clientMessageId === outgoing.clientMessageId ? { ...o, status: "failed" } : o)),
      );
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body) return;
    setDraft("");
    await deliver({ clientMessageId: newClientId("msg"), body, status: "sending" });
  };

  if (authLoading || !user || loadState === "loading") {
    return (
      <ContentContainer>
        <Skeleton className="h-6 w-40 mb-4" />
        <Skeleton className="h-96 w-full" />
      </ContentContainer>
    );
  }

  if (loadState === "denied" || loadState === "error" || !conversation) {
    return (
      <ContentContainer>
        <Link href="/messages" className="back-link">
          <ArrowLeft size={15} /> Back to messages
        </Link>
        <div className="catalogue-state">
          <h1 className="section-title">
            {loadState === "denied" ? "Conversation not available" : "Something went wrong"}
          </h1>
          <p>
            {loadState === "denied"
              ? "This conversation does not exist or you are not part of it."
              : loadError}
          </p>
        </div>
      </ContentContainer>
    );
  }

  return (
    <ContentContainer>
      <div className="mx-auto max-w-[860px]">
      <Link href="/messages" className="back-link">
        <ArrowLeft size={15} /> Back to messages
      </Link>
      <section className="workspace-card !p-0 overflow-hidden">
        <header className="flex items-center gap-3 border-b border-[var(--nsr-divider)] px-5 py-4">
          <AvatarInitials name={conversation.otherMember.displayName} size="md" />
          <div className="min-w-0">
            <p className="text-[15px] font-semibold">{conversation.otherMember.displayName}</p>
            {conversation.contextPath ? (
              <Link href={conversation.contextPath} className="text-[13px] text-[var(--nsr-link)] hover:underline">
                {conversation.contextTitle}
              </Link>
            ) : (
              <p className="text-[13px] text-[var(--nsr-text-secondary)]">{conversation.contextTitle}</p>
            )}
          </div>
        </header>

        <div className="flex h-[52vh] min-h-[320px] flex-col gap-2 overflow-y-auto px-5 py-4" aria-live="polite">
          {messages.length === 0 && outbox.length === 0 && (
            <p className="m-auto text-[14px] text-[var(--nsr-text-secondary)]">
              No messages yet. Say hello and ask what you need to know.
            </p>
          )}
          {messages.map((m) => {
            const mine = m.senderUid === user.uid;
            return (
              <div key={m.id} className={mine ? "flex flex-col items-end" : "flex flex-col items-start"}>
                <div className={`bubble ${mine ? "bubble--mine" : "bubble--theirs"}`}>{m.body}</div>
                <span className="mt-0.5 text-[11px] text-[var(--nsr-text-secondary)]">
                  {formatDateTime(m.createdAt)}
                  {!mine && (
                    <>
                      {" · "}
                      <Link href={`/reports/new?type=message&id=${encodeURIComponent(m.id)}`} className="hover:text-[var(--nsr-error)]">
                        Report
                      </Link>
                    </>
                  )}
                </span>
              </div>
            );
          })}
          {outbox.map((o) => (
            <div key={o.clientMessageId} className="flex flex-col items-end">
              <div className="bubble bubble--mine opacity-70">{o.body}</div>
              {o.status === "sending" ? (
                <span className="mt-0.5 text-[11px] text-[var(--nsr-text-secondary)]">Sending...</span>
              ) : (
                <span className="mt-0.5 text-[11px] text-[var(--nsr-error)]">
                  Not sent.{" "}
                  <button type="button" className="font-semibold underline" onClick={() => deliver(o)}>
                    Retry
                  </button>
                </span>
              )}
            </div>
          ))}
          <div ref={bottom} />
        </div>

        <form onSubmit={handleSend} className="flex items-end gap-2 border-t border-[var(--nsr-divider)] px-5 py-4">
          <label className="booking-field flex-1">
            <span className="sr-only">Message</span>
            <textarea
              rows={2}
              maxLength={MAX_LENGTH}
              value={draft}
              placeholder="Write a message"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
          </label>
          <Button type="submit" disabled={!draft.trim()} aria-label="Send message">
            <Send size={16} /> Send
          </Button>
        </form>
      </section>
      <div className="mt-2">
        <Alert variant="info">
          Messages are plain text and visible only to the two of you. Pickup addresses belong in the booking&apos;s
          private arrangements.
        </Alert>
      </div>
      </div>
    </ContentContainer>
  );
}
