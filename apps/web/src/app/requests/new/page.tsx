"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ContentContainer } from "@/components/layout/content-container";
import { PageHeading } from "@/components/layout/page-heading";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-context";
import { createRequest } from "@/features/community/community-api";
import { CATEGORIES, RIYADH_NEIGHBORHOODS } from "@/lib/catalogue-options";
import { errorText } from "@/lib/api-client";
import { riyadhLocalToIso } from "@/lib/format";

export default function NewRequestPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [neighborhoodId, setNeighborhoodId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [maxSar, setMaxSar] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.push("/sign-in?return=/requests/new");
  }, [authLoading, user, router]);

  const submit = async () => {
    setError(null);
    if (!title.trim() || !categoryId || !neighborhoodId || !from || !to) {
      setError("Fill in what you need, the category, your neighborhood and the dates.");
      return;
    }
    setBusy(true);
    const res = await createRequest({
      title: title.trim(),
      description: description.trim(),
      categoryId,
      neighborhoodId,
      desiredStartAt: riyadhLocalToIso(from),
      desiredEndAt: riyadhLocalToIso(to),
      maxDailyRateHalalas: maxSar ? Math.round(Number(maxSar) * 100) : null,
    });
    setBusy(false);
    if (res.data) router.push(`/requests/${res.data.id}`);
    else setError(errorText(res.error, "The request could not be posted."));
  };

  return (
    <ContentContainer>
      <div className="max-w-2xl mx-auto">
        <Link href="/requests" className="back-link">
          <ArrowLeft size={15} /> Back to requests
        </Link>
        <PageHeading
          title="Ask for an item"
          subtitle="Your request shows your first name, the neighborhood and the dates. Never your address."
        />
        <section className="form-section flex flex-col gap-4">
          <Field label="What do you need?" name="title" value={title} required onChange={(e) => setTitle(e.target.value)} />
          <Field
            label="Details (optional)"
            name="description"
            multiline
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="form-grid">
            <Select label="Category" name="categoryId" required value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Select a category</option>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
            <Select
              label="Neighborhood"
              name="neighborhoodId"
              required
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
            <Field label="From (Riyadh time)" name="from" type="datetime-local" required value={from} onChange={(e) => setFrom(e.target.value)} />
            <Field label="Until (Riyadh time)" name="to" type="datetime-local" required value={to} onChange={(e) => setTo(e.target.value)} />
            <Field
              label="Budget, SAR per day (optional)"
              name="maxSar"
              type="number"
              value={maxSar}
              onChange={(e) => setMaxSar(e.target.value)}
            />
          </div>
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex justify-end">
            <Button loading={busy} onClick={submit}>
              Post request
            </Button>
          </div>
        </section>
      </div>
    </ContentContainer>
  );
}
