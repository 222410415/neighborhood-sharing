"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useAuth } from "@/features/auth/auth-context";

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await resetPassword(email);
    } catch {
      // Neutral feedback — don't reveal whether email exists
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <AuthShell
        title="Check your email."
        intro="You’re one step closer to getting back in."
      >
        <Alert variant="info" title="Password reset sent">
          If an account exists for {email || "your email"}, a password reset
          link has been sent. Check your inbox and follow the link to reset your
          password.
        </Alert>
        <div className="mt-6">
          <Link
            href="/sign-in"
            className="text-[14px] text-[var(--nsr-link)] underline"
          >
            Back to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset your password."
      intro="Enter your email and we’ll send you a reset link."
    >
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
        <Button type="submit" loading={loading} className="w-full">
          Send reset link
        </Button>
      </form>

      <p className="text-[14px] text-[var(--nsr-text-secondary)] mt-4 text-center">
        Remember your password?{" "}
        <Link href="/sign-in" className="text-[var(--nsr-link)] underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
