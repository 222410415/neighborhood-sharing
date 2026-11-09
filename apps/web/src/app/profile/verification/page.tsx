"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendEmailVerification } from "firebase/auth";
import { ArrowLeft, BadgeCheck, FlaskConical, MailCheck } from "lucide-react";
import { ContentContainer } from "@/components/layout/content-container";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-context";
import {
  fetchVerification,
  requestDemoCheck,
  syncEmailVerification,
  type VerificationStatus,
} from "@/features/trust/trust-api";
import { errorText } from "@/lib/api-client";
import { formatDateTime } from "@/lib/format";

const STATUS: Record<string, string> = { pending: "Waiting for an admin", verified: "Passed", rejected: "Not passed" };

export default function VerificationPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [status, setStatus] = useState<VerificationStatus | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/sign-in?return=/profile/verification");
  }, [authLoading, user, router]);

  const load = useCallback(async () => {
    const res = await fetchVerification();
    if (res.data) setStatus(res.data);
    else setMessage({ kind: "error", text: errorText(res.error, "Verification status could not be loaded.") });
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (authLoading || !user || !status) {
    return <ContentContainer><Skeleton className="h-64 w-full max-w-2xl mx-auto" /></ContentContainer>;
  }

  const sendLink = async () => {
    setBusy("send");
    setMessage(null);
    try {
      await sendEmailVerification(user);
      setMessage({ kind: "info", text: "We sent a verification link to your email. Open it, then press Check again." });
    } catch {
      setMessage({ kind: "error", text: "The link could not be sent. Try again in a moment." });
    }
    setBusy(null);
  };

  const sync = async () => {
    setBusy("sync");
    setMessage(null);
    await user.reload().catch(() => undefined);
    const res = await syncEmailVerification();
    setBusy(null);
    if (res.data) {
      setStatus(res.data);
      setMessage(
        res.data.emailVerified
          ? { kind: "success", text: "Your email is verified." }
          : { kind: "info", text: "Your email is not verified yet." },
      );
    } else setMessage({ kind: "error", text: errorText(res.error, "Could not check your email status.") });
  };

  const demo = async (type: "phone_demo" | "identity_demo") => {
    setBusy(type);
    setMessage(null);
    const res = await requestDemoCheck(type);
    setBusy(null);
    if (res.error) setMessage({ kind: "error", text: errorText(res.error, "The check could not be requested.") });
    await load();
  };

  const demoChecks = status.checks.filter((c) => c.isSimulated);

  return (
    <ContentContainer>
      <div className="max-w-2xl mx-auto">
        <Link href="/profile" className="back-link">
          <ArrowLeft size={15} /> Back to profile
        </Link>
        <PageHeading
          title="Verification"
          subtitle="What other members see on your profile, and how it is checked."
        />
        {message && (
          <div className="mb-4">
            <Alert variant={message.kind}>{message.text}</Alert>
          </div>
        )}

        <section className="workspace-card">
          <h2 className="inline-flex items-center gap-2">
            <MailCheck size={18} /> Email
          </h2>
          <p className="text-[14px]">
            {status.emailVerified
              ? "Your email address is verified with Firebase."
              : "Your email address is not verified yet."}
          </p>
          <p className="text-[12px] text-[var(--nsr-text-secondary)]">
            Your email itself is never shown to other members; only the label &quot;Email verified&quot; is.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {!status.emailVerified && (
              <Button size="sm" variant="secondary" loading={busy === "send"} onClick={sendLink}>
                Send verification link
              </Button>
            )}
            <Button size="sm" loading={busy === "sync"} onClick={sync}>
              Check again
            </Button>
          </div>
        </section>

        <section className="workspace-card">
          <h2 className="inline-flex items-center gap-2">
            <FlaskConical size={18} /> Demonstration checks
          </h2>
          <Alert variant="warning" title="Simulated">
            These checks exist only to demonstrate the workflow. No phone number or identity document is collected, and a
            passed check is shown as &quot;Demo check (simulated)&quot;, never as identity verification.
          </Alert>
          <ul className="mt-3 flex flex-col gap-2">
            {demoChecks.length === 0 && (
              <li className="text-[14px] text-[var(--nsr-text-secondary)]">No demonstration checks requested.</li>
            )}
            {demoChecks.map((c) => (
              <li key={c.id} className="text-[14px]">
                {c.type === "phone_demo" ? "Phone (demo)" : "Identity (demo)"}: <strong>{STATUS[c.status]}</strong>
                {c.checkedAt ? ` on ${formatDateTime(c.checkedAt)}` : ""}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" loading={busy === "phone_demo"} onClick={() => demo("phone_demo")}>
              Request phone demo check
            </Button>
            <Button size="sm" variant="secondary" loading={busy === "identity_demo"} onClick={() => demo("identity_demo")}>
              Request identity demo check
            </Button>
          </div>
        </section>

        <section className="workspace-card">
          <h2>Shown on your public profile</h2>
          {status.labels.length === 0 ? (
            <p className="text-[14px] text-[var(--nsr-text-secondary)]">No verification labels yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {status.labels.map((l) => (
                <span
                  key={l.label}
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold ${
                    l.isSimulated
                      ? "bg-[var(--nsr-warning-background)] text-[var(--nsr-warning)]"
                      : "bg-[var(--nsr-success-background)] text-[var(--nsr-success)]"
                  }`}
                >
                  {l.isSimulated ? <FlaskConical size={13} /> : <BadgeCheck size={13} />} {l.label}
                </span>
              ))}
            </div>
          )}
          <Link href={`/members/${user.uid}`} className="mt-3 inline-block text-[13px] font-semibold text-[var(--nsr-link)]">
            View your public profile
          </Link>
        </section>
      </div>
    </ContentContainer>
  );
}
