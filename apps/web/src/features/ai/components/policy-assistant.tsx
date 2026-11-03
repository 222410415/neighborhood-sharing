"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpenCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-context";
import { askPolicies, type PolicyAnswer } from "@/features/ai/ai-api";
import { errorText } from "@/lib/api-client";

/**
 * "Ask about policies" panel. Answers come only from the platform policies,
 * with the sources shown; drafts are labelled. It cannot take any action.
 */
export function PolicyAssistant({ bookingId, compact = false }: { bookingId?: string; compact?: boolean }) {
  const { user } = useAuth();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<PolicyAnswer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim().length < 3) return;
    setBusy(true);
    setError(null);
    const res = await askPolicies({ question: question.trim(), bookingId });
    setBusy(false);
    if (res.data) setAnswer(res.data);
    else setError(errorText(res.error, "The assistant could not answer right now."));
  };

  return (
    <section className={compact ? "" : "workspace-card"} aria-labelledby="assistant-heading">
      <h2 id="assistant-heading" className="inline-flex items-center gap-2 !text-[17px]">
        <BookOpenCheck size={18} /> Ask about policies
      </h2>
      <p className="text-[12px] text-[var(--nsr-text-secondary)] mb-3">
        Answers come only from the platform&apos;s policy texts and show their sources. The assistant cannot change
        bookings, payments, verification or disputes.
        {bookingId ? " Questions here use the policy versions that applied to this booking." : ""}
      </p>
      {!user ? (
        <p className="text-[13px]">
          <Link href="/sign-in" className="underline">
            Sign in
          </Link>{" "}
          to ask a question. You can read every policy without signing in.
        </p>
      ) : (
        <form onSubmit={ask} className="flex flex-col gap-2">
          <label className="booking-field">
            <span className="sr-only">Your question</span>
            <textarea
              rows={2}
              maxLength={500}
              value={question}
              placeholder="For example: What happens to my deposit if the item comes back damaged?"
              onChange={(e) => setQuestion(e.target.value)}
            />
          </label>
          <div className="flex justify-end">
            <Button size="sm" type="submit" loading={busy} disabled={question.trim().length < 3}>
              Ask
            </Button>
          </div>
        </form>
      )}
      {error && (
        <div className="mt-2">
          <Alert variant="error">{error}</Alert>
        </div>
      )}
      {answer && (
        <div className="mt-3 flex flex-col gap-2" aria-live="polite" dir={answer.locale === "ar-SA" ? "rtl" : "ltr"}>
          {answer.draftNotice && <Alert variant="warning">{answer.draftNotice}</Alert>}
          {answer.bookingContext && (
            <p className="text-[12px] text-[var(--nsr-text-secondary)]">{answer.bookingContext.note}</p>
          )}
          <div className="rounded-[var(--nsr-radius-md)] bg-[#f4f8f3] p-3 text-[14px] whitespace-pre-wrap">{answer.answer}</div>
          <p className="text-[11px] text-[var(--nsr-text-secondary)]" dir="ltr">
            {answer.generated === "ai"
              ? "AI-generated from the cited policy passages. Check the sources."
              : answer.generated === "extractive"
                ? "Showing the matching policy text (no generated answer)."
                : "No policy passage applies to this question."}
          </p>
          {answer.sources.length > 0 && (
            <div>
              <p className="text-[12px] font-semibold">Sources</p>
              <ul className="text-[12px]">
                {answer.sources.map((s) => (
                  <li key={s.policyVersionId}>
                    <Link href={`/policies/${s.policyKey}`} className="text-[var(--nsr-link)] underline">
                      {s.title}
                    </Link>{" "}
                    (version {s.version}
                    {s.isDemoDraft ? ", demonstration draft" : ""})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
