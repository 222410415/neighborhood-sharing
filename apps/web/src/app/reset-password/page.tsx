"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthShell } from "@/components/layout/auth-shell";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { getFirebaseAuth } from "@/lib/firebase-client";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";

function ResetPasswordContent() {
  const searchParams = useSearchParams();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const oobCode = searchParams.get("oobCode") ?? "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (!oobCode) {
      setError("Invalid reset link. Please request a new password reset.");
      return;
    }

    setLoading(true);

    try {
      const auth = getFirebaseAuth();
      await verifyPasswordResetCode(auth, oobCode);
      await confirmPasswordReset(auth, oobCode, password);
      setDone(true);
    } catch (err: any) {
      const code = err?.code ?? "";
      if (code === "auth/expired-action-code") {
        setError("This reset link has expired. Please request a new one.");
      } else if (code === "auth/invalid-action-code") {
        setError("This reset link is invalid. Please request a new one.");
      } else {
        setError("Password reset failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell title="Password updated." intro="You’re ready to get back to your neighborhood.">
          <Alert variant="success" title="Password updated">
            Your password has been changed. You can now sign in with your new password.
          </Alert>
          <div className="mt-6">
            <Link
              href="/sign-in"
              className="px-4 py-2 text-[14px] font-medium rounded-[var(--nsr-radius-md)] bg-[var(--nsr-primary)] text-[var(--nsr-on-primary)] hover:bg-[var(--nsr-primary-hover)] transition-colors"
            >
              Sign in
            </Link>
          </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Set a new password." intro="Choose a password of at least eight characters.">

        {error && (
          <div className="mb-4">
            <Alert variant="error">{error}</Alert>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field
            label="New password"
            name="password"
            type="password"
            value={password}
            placeholder="At least 8 characters"
            required
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label="Confirm password"
            name="confirmPassword"
            type="password"
            value={confirmPassword}
            placeholder="Re-enter your new password"
            required
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <Button type="submit" loading={loading} className="w-full">
            Reset password
          </Button>
        </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="py-12" />}>
      <ResetPasswordContent />
    </Suspense>
  );
}
