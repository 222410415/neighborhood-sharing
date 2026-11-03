"use client";

import { useState, Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ContentContainer } from "@/components/layout/content-container";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useAuth } from "@/features/auth/auth-context";
import { RIYADH_NEIGHBORHOODS } from "@/lib/catalogue-options";
import { useProfile } from "@/features/profile/use-profile";

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { createProfile } = useProfile();

  const [displayName, setDisplayName] = useState("");
  const [neighborhoodId, setNeighborhoodId] = useState("");
  const [biography, setBiography] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Prefill name from sign-up query param
    const nameParam = searchParams.get("name");
    if (nameParam) setDisplayName(nameParam);
  }, [searchParams]);

  // Redirect to sign-in if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/sign-in");
    }
  }, [authLoading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (!displayName.trim()) errors["displayName"] = "Name is required";
    if (!neighborhoodId)
      errors["neighborhoodId"] = "Please select a neighborhood";

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);

    try {
      await createProfile(displayName, neighborhoodId);
      router.push("/");
    } catch (err: any) {
      if (err?.fieldErrors) {
        const fe: Record<string, string> = {};
        for (const f of err.fieldErrors) {
          fe[f.field] = f.message;
        }
        setFieldErrors(fe);
      } else {
        setError(err?.message ?? "Failed to save profile. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <ContentContainer>
        <div className="max-w-lg mx-auto py-8">
          <p className="text-[15px] text-[var(--nsr-text-secondary)]">
            Loading...
          </p>
        </div>
      </ContentContainer>
    );
  }

  return (
    <ContentContainer>
      <div className="max-w-lg mx-auto py-8">
        <h1 className="font-[Georgia] text-[39px] tracking-[-0.04em] text-[var(--nsr-text)] mb-2">
          Get to know your neighborhood.
        </h1>
        <p className="text-[14px] text-[var(--nsr-text-secondary)] mb-6">
          A few details help neighbors feel at home sharing with you.
        </p>

        {error && (
          <div className="mb-4">
            <Alert variant="error">{error}</Alert>
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="form-section flex flex-col gap-4"
        >
          <Field
            label="Display name"
            name="displayName"
            value={displayName}
            placeholder="Your name"
            required
            error={fieldErrors["displayName"]}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <Select
            label="Neighborhood"
            name="neighborhoodId"
            required
            error={fieldErrors["neighborhoodId"]}
            value={neighborhoodId}
            onChange={(e) => setNeighborhoodId(e.target.value)}
          >
            <option value="">Select a neighborhood</option>
            {RIYADH_NEIGHBORHOODS.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </Select>
          <Field
            label="Biography (optional)"
            name="biography"
            placeholder="Tell neighbors a bit about yourself"
            value={biography}
            multiline
            onChange={(e) => setBiography(e.target.value)}
          />
          <p className="text-[13px] text-[var(--nsr-text-secondary)]">
            Sharing is currently available in Riyadh.
          </p>
          <div className="flex justify-end mt-2">
            <Button type="submit" loading={submitting}>
              Continue
            </Button>
          </div>
        </form>
      </div>
    </ContentContainer>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="py-12" />}>
      <OnboardingContent />
    </Suspense>
  );
}
