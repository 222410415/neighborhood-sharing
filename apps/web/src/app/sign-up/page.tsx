"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/layout/auth-shell";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useAuth } from "@/features/auth/auth-context";

const MIN_PASSWORD_LENGTH = 8;

export default function SignUpPage() {
  const router = useRouter();
  const { signUp } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const validate = (): boolean => {
    const errors: Record<string, string> = {};

    if (!name.trim()) {
      errors["displayName"] = "Name is required";
    }
    if (!email.trim()) {
      errors["email"] = "Email is required";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors["email"] = "Please enter a valid email";
    }
    if (!password) {
      errors["password"] = "Password is required";
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      errors["password"] =
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validate()) return;

    setLoading(true);

    try {
      await signUp(email, password);
      // Redirect to onboarding to collect name and location
      router.push(`/onboarding?name=${encodeURIComponent(name)}`);
    } catch (err: any) {
      const code = err?.code ?? "";
      if (code === "auth/email-already-in-use") {
        setError("This email is already registered. Try signing in instead.");
      } else if (code === "auth/weak-password") {
        setError("Password is too weak. Use at least 8 characters.");
      } else if (code === "auth/network-request-failed") {
        setError("Network error. Check your connection and try again.");
      } else {
        setError("Sign up failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title="Join your neighborhood."
      intro="Borrow more, own less, and share what you love."
    >
      {error && (
        <div className="mb-4">
          <Alert variant="error">{error}</Alert>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Field
          label="Name"
          name="displayName"
          value={name}
          placeholder="Your full name"
          required
          error={fieldErrors["displayName"]}
          onChange={(e) => setName(e.target.value)}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          value={email}
          placeholder="you@example.com"
          required
          error={fieldErrors["email"]}
          onChange={(e) => setEmail(e.target.value)}
        />
        <div className="relative">
          <Field
            label="Password"
            name="password"
            type={showPassword ? "text" : "password"}
            value={password}
            placeholder="At least 8 characters"
            required
            error={fieldErrors["password"]}
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

        <Button type="submit" loading={loading} className="w-full">
          Create account
        </Button>
      </form>

      <p className="text-[14px] text-[var(--nsr-text-secondary)] mt-4 text-center">
        Already have an account?{" "}
        <a href="/sign-in" className="text-[var(--nsr-link)] underline">
          Sign in
        </a>
      </p>
    </AuthShell>
  );
}
