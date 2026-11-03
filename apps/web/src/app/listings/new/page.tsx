"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ContentContainer } from "@/components/layout/content-container";
import { PageHeading } from "@/components/layout/page-heading";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { useAuth } from "@/features/auth/auth-context";
import {
  RIYADH_NEIGHBORHOODS,
  CATEGORIES,
  CONDITIONS,
} from "@/lib/catalogue-options";
import { useProfile } from "@/features/profile/use-profile";
import { createListing } from "@/features/listings/listings-api";

export default function NewListingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { profile } = useProfile();

  const [titleEn, setTitleEn] = useState("");
  const [descriptionEn, setDescriptionEn] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [neighborhoodId, setNeighborhoodId] = useState("");
  const [condition, setCondition] = useState("");
  const [lendingMode, setLendingMode] = useState<"free" | "paid">("paid");
  const [dailyRate, setDailyRate] = useState("");
  const [deposit, setDeposit] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/sign-in?return=/listings/new");
    }
  }, [authLoading, user, router]);

  // Prefill neighborhood from profile
  useEffect(() => {
    if (profile?.profile?.neighborhoodId && !neighborhoodId) {
      setNeighborhoodId(profile.profile.neighborhoodId);
    }
  }, [profile, neighborhoodId]);

  // Warn before leaving dirty form
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const markDirty = () => setDirty(true);

  const handleLendingModeChange = (mode: "free" | "paid") => {
    setLendingMode(mode);
    if (mode === "free") {
      setDailyRate("");
    }
    markDirty();
  };

  const handleSave = async () => {
    setError(null);
    setFieldErrors({});

    const errors: Record<string, string> = {};
    if (!titleEn.trim()) errors["titleEn"] = "Title is required";
    if (!descriptionEn.trim())
      errors["descriptionEn"] = "Description is required";
    if (!categoryId) errors["categoryId"] = "Category is required";
    if (!neighborhoodId) errors["neighborhoodId"] = "Neighborhood is required";
    if (!condition) errors["condition"] = "Condition is required";

    let dailyRateHalalas: number | undefined;
    let depositHalalas: number | undefined;

    if (lendingMode === "paid") {
      const rate = parseFloat(dailyRate);
      if (isNaN(rate) || rate <= 0) {
        errors["dailyRateHalalas"] = "Daily rate must be a positive number";
      } else {
        dailyRateHalalas = Math.round(rate * 100);
      }
    } else {
      dailyRateHalalas = 0;
    }

    if (deposit) {
      const dep = parseFloat(deposit);
      if (isNaN(dep) || dep < 0) {
        errors["depositHalalas"] = "Deposit must be a non-negative number";
      } else {
        depositHalalas = Math.round(dep * 100);
      }
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setSaving(true);
    const clientSubmissionId = `new-${Date.now()}`;

    const res = await createListing({
      titleEn,
      descriptionEn,
      categoryId,
      neighborhoodId,
      condition,
      lendingMode,
      dailyRateHalalas,
      depositHalalas,
      clientSubmissionId,
    });

    setSaving(false);

    if (res.data) {
      setDirty(false);
      router.push(`/listings/${res.data.id}/edit`);
    } else {
      if (res.error?.fieldErrors) {
        const fe: Record<string, string> = {};
        for (const f of res.error.fieldErrors) {
          fe[f.field] = f.message;
        }
        setFieldErrors(fe);
      } else {
        setError(res.error?.message ?? "Failed to save. Please try again.");
      }
    }
  };

  if (authLoading) {
    return (
      <ContentContainer>
        <div className="max-w-3xl mx-auto py-8">
          <p className="text-[15px] text-[var(--nsr-text-secondary)]">
            Loading...
          </p>
        </div>
      </ContentContainer>
    );
  }

  if (!user) return null;

  return (
    <ContentContainer>
      <div className="max-w-3xl mx-auto">
        <PageHeading
          title="Share something useful."
          subtitle="Tell your neighbors what makes this item handy. You can add photos next."
        />

        {error && (
          <div className="mb-4">
            <Alert variant="error">{error}</Alert>
          </div>
        )}

        {/* Item information */}
        <section className="form-section">
          <h2>About your item</h2>
          <p>Start with the essentials your neighbors will want to know.</p>
          <div className="form-grid">
            <div className="form-span">
              <Field
                label="Title"
                name="titleEn"
                value={titleEn}
                placeholder="e.g. Cordless Drill Kit"
                required
                error={fieldErrors["titleEn"]}
                onChange={(e) => {
                  setTitleEn(e.target.value);
                  markDirty();
                }}
              />
            </div>
            <div className="form-span">
              <Field
                label="Description"
                name="descriptionEn"
                value={descriptionEn}
                placeholder="Describe your item — what it includes and how to use it"
                required
                multiline
                error={fieldErrors["descriptionEn"]}
                onChange={(e) => {
                  setDescriptionEn(e.target.value);
                  markDirty();
                }}
              />
            </div>
            <Select
              label="Category"
              name="categoryId"
              required
              value={categoryId}
              error={fieldErrors["categoryId"]}
              onChange={(e) => {
                setCategoryId(e.target.value);
                markDirty();
              }}
            >
              <option value="">Select a category</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              label="Condition"
              name="condition"
              required
              value={condition}
              error={fieldErrors["condition"]}
              onChange={(e) => {
                setCondition(e.target.value);
                markDirty();
              }}
            >
              <option value="">Select condition</option>
              {CONDITIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
        </section>

        <section className="form-section">
          <h2>How you’d like to share</h2>
          <p>Lend it for free or set a daily rate.</p>
          <div className="flex flex-col gap-4">
            <div className="choice-row">
              <label className="choice-card">
                <input
                  type="radio"
                  name="lendingMode"
                  value="free"
                  checked={lendingMode === "free"}
                  onChange={() => handleLendingModeChange("free")}
                />
                <span className="text-[15px] text-[var(--nsr-text)]">
                  Free lending
                </span>
              </label>
              <label className="choice-card">
                <input
                  type="radio"
                  name="lendingMode"
                  value="paid"
                  checked={lendingMode === "paid"}
                  onChange={() => handleLendingModeChange("paid")}
                />
                <span className="text-[15px] text-[var(--nsr-text)]">
                  Paid rental
                </span>
              </label>
            </div>
            {lendingMode === "paid" && (
              <Field
                label="Daily rate (SAR)"
                name="dailyRate"
                type="number"
                value={dailyRate}
                placeholder="15"
                error={fieldErrors["dailyRateHalalas"]}
                onChange={(e) => {
                  setDailyRate(e.target.value);
                  markDirty();
                }}
              />
            )}
            <Field
              label="Refundable deposit (SAR, optional)"
              name="deposit"
              type="number"
              value={deposit}
              placeholder="100"
              error={fieldErrors["depositHalalas"]}
              onChange={(e) => {
                setDeposit(e.target.value);
                markDirty();
              }}
            />
            {lendingMode === "free" && deposit && parseFloat(deposit) > 0 && (
              <p className="text-[13px] text-[var(--nsr-text-secondary)]">
                This item is free to borrow but requires a refundable deposit.
              </p>
            )}
          </div>
        </section>

        <section className="form-section">
          <h2>Where neighbors can find it</h2>
          <p>Only your neighborhood is shown publicly.</p>
          <Select
            label="Neighborhood"
            name="neighborhoodId"
            required
            value={neighborhoodId}
            error={fieldErrors["neighborhoodId"]}
            onChange={(e) => {
              setNeighborhoodId(e.target.value);
              markDirty();
            }}
          >
            <option value="">Select a neighborhood</option>
            {RIYADH_NEIGHBORHOODS.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </Select>
        </section>

        <div className="flex justify-end gap-3 mt-6">
          <Button loading={saving} onClick={handleSave}>
            Save and add photos
          </Button>
        </div>
      </div>
    </ContentContainer>
  );
}
