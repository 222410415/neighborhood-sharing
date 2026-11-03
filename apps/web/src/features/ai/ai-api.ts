/** AI-assisted features: related-item suggestions and the policy assistant. */

import { apiFetch } from "@/lib/api-client";

export interface SuggestionItem {
  id: string;
  titleEn: string;
  categoryId: string;
  categoryName: string;
  neighborhoodName: string;
  lendingMode: "free" | "paid";
  dailyRateHalalas: number;
  depositHalalas: number;
  primaryMediaId: string | null;
  reason: string | null;
}

export interface Suggestions {
  listingId: string;
  source: "ai" | "category";
  label: string;
  items: SuggestionItem[];
  generatedAt: string;
}

/** Sends the token when signed in so the viewer's own items are left out. */
export const fetchSuggestions = (listingId: string) =>
  apiFetch<Suggestions>(`/listings/${encodeURIComponent(listingId)}/suggestions`);

export interface PolicySummary {
  id: string;
  policyKey: string;
  version: string;
  titleEn: string;
  titleAr: string;
  status: "draft" | "published" | "retired";
  isDemoDraft: boolean;
  approvedAt: string | null;
  effectiveAt: string | null;
}

export interface Policy extends PolicySummary {
  bodyEn: string;
  bodyAr: string;
}

export interface PolicyAnswer {
  answer: string;
  canAnswer: boolean;
  generated: "ai" | "extractive" | "none";
  sources: {
    policyVersionId: string;
    policyKey: string;
    version: string;
    title: string;
    isDemoDraft: boolean;
    excerpt: string;
  }[];
  draftNotice: string | null;
  bookingContext: { bookingId: string; note: string } | null;
  locale: "en-SA" | "ar-SA";
}

export const fetchPolicies = () => apiFetch<{ items: PolicySummary[] }>("/policies", { auth: false });
export const fetchPolicy = (key: string) => apiFetch<Policy>(`/policies/${encodeURIComponent(key)}`, { auth: false });
export const askPolicies = (body: { question: string; locale?: "en-SA" | "ar-SA"; bookingId?: string }) =>
  apiFetch<PolicyAnswer>("/policies/ask", { method: "POST", body });
export const publishPolicy = (id: string) =>
  apiFetch<Policy>(`/admin/policies/${encodeURIComponent(id)}/publish`, { method: "POST" });
