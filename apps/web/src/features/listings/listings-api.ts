/**
 * Listings API client — owner-side listing management.
 */

import { apiFetch } from "@/lib/api-client";

export interface OwnerListing {
  id: string;
  slug: string;
  ownerUid: string;
  categoryId: string;
  neighborhoodId: string;
  titleEn: string;
  titleAr?: string;
  descriptionEn: string;
  descriptionAr?: string;
  condition: string;
  status: "draft" | "published" | "paused" | "archived";
  lendingMode: "free" | "paid";
  currency: string;
  dailyRateHalalas: number;
  depositHalalas: number;
  primaryMediaId: string | null;
  mediaIds: string[];
  revision: number;
  createdAt: string;
  updatedAt?: string;
  bookingMode?: "approval" | "instant";
  bookableFrom?: string | null;
  bookableUntil?: string | null;
  /** Set when a reviewer removed the listing after a report; only an admin can restore it. */
  moderationStatus?: "removed" | null;
  moderationReason?: string | null;
  moderatedAt?: string | null;
}

export async function fetchMyListings(status?: string) {
  const query = status && status !== "all" ? `?status=${status}` : "";
  return apiFetch<{ items: OwnerListing[] }>(`/me/listings${query}`);
}

export async function fetchMyListing(id: string) {
  return apiFetch<OwnerListing>(`/me/listings/${id}`);
}

export async function createListing(body: {
  titleEn: string;
  descriptionEn: string;
  categoryId: string;
  neighborhoodId: string;
  condition: string;
  lendingMode: "free" | "paid";
  dailyRateHalalas?: number;
  depositHalalas?: number;
  clientSubmissionId?: string;
}) {
  return apiFetch<OwnerListing>("/me/listings", { method: "POST", body });
}

export async function updateListing(
  id: string,
  body: {
    titleEn?: string;
    descriptionEn?: string;
    categoryId?: string;
    neighborhoodId?: string;
    condition?: string;
    lendingMode?: "free" | "paid";
    dailyRateHalalas?: number;
    depositHalalas?: number;
    expectedRevision: number;
  },
) {
  return apiFetch<OwnerListing>(`/me/listings/${id}`, { method: "PATCH", body });
}

export async function publishListing(id: string, expectedRevision: number) {
  return apiFetch<OwnerListing>(`/me/listings/${id}/publish`, {
    method: "POST",
    body: { expectedRevision },
  });
}

export async function pauseListing(id: string, expectedRevision: number) {
  return apiFetch<OwnerListing>(`/me/listings/${id}/pause`, {
    method: "POST",
    body: { expectedRevision },
  });
}

export async function archiveListing(id: string, expectedRevision: number) {
  return apiFetch<OwnerListing>(`/me/listings/${id}/archive`, {
    method: "POST",
    body: { expectedRevision },
  });
}

export async function attachListingMedia(id: string, mediaIds: string[]) {
  return apiFetch<{ attached: string[]; rejected: { id: string; reason: string }[] }>(
    `/me/listings/${id}/media`,
    { method: "POST", body: { mediaIds } },
  );
}

export async function detachListingMedia(id: string, mediaId: string) {
  return apiFetch<null>(`/me/listings/${id}/media/${mediaId}`, { method: "DELETE" });
}
