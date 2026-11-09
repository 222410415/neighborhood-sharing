"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useAuth } from "@/features/auth/auth-context";
import { getSafeReturnUrl } from "@/lib/return-url";

const SUSPENDED_TEXT =
  "This account is suspended by a reviewer after a report. Contact the team if you think this is a mistake.";

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams.get("suspended") === "1" ? SUSPENDED_TEXT : null,
  );
  const [loading, setLoading] = useState(false);

  const returnUrl = getSafeReturnUrl(searchParams.get("return"));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await signIn(email, password);
      router.push(returnUrl);
    } catch (err: any) {
      const code = err?.code ?? "";
      if (
        code === "auth/invalid-credential" ||
        code === "auth/wrong-password"
      ) {
        setError("Invalid email or password");
      } else if (code === "auth/user-disabled") {
        setError(SUSPENDED_TEXT);
      } else if (code === "auth/too-many-requests") {
        setError("Too many attempts. Please try again later.");
      } else if (code === "auth/network-request-failed") {
        setError("Network error. Check your connection and try again.");
      } else {
        setError("Sign in failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back."
      intro="Sign in to keep sharing with your neighbors."
    >
      {error && (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field
          label="Email"
          name="email"
          type="email"
          value={email}
          placeholder="you@example.com"
          required
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="relative">
          <Field
            label="Password"
            name="password"
            type={showPassword ? "text" : "password"}
            value={password}
            placeholder="Your password"
            required
            hasToggle
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-[34px] z-10 text-[13px] font-medium text-[var(--nsr-primary)] hover:text-[var(--nsr-primary-hover)] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--nsr-focus)] bg-[var(--nsr-surface)] rounded px-1"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>

        <div className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-[14px] text-[var(--nsr-link)] underline"
          >
            Forgot password?
          </Link>
        </div>

        <Button type="submit" loading={loading} className="w-full">
          Sign in
        </Button>
      </form>

      <p className="text-[14px] text-[var(--nsr-text-secondary)] mt-4 text-center">
        Don't have an account?{" "}
        <Link href="/sign-up" className="text-[var(--nsr-link)] underline">
          Sign up
        </Link>
      </p>
    </AuthShell>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="py-12" />}>
      <SignInContent />
    </Suspense>
  );
}
