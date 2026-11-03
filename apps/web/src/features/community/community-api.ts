/** Community API client — favorites and community requests with offers. */

import { apiFetch } from "@/lib/api-client";

export interface Favorite {
  id: string;
  listingId: string;
  createdAt: string;
  alertEnabled: boolean;
  desiredStartAt: string | null;
  desiredEndAt: string | null;
  listing: {
    titleEn: string;
    status: string;
    isPublic: boolean;
    lendingMode: "free" | "paid";
    dailyRateHalalas: number;
    depositHalalas: number;
    primaryMediaId: string | null;
    neighborhoodName: string;
  };
  availableForDates: boolean | null;
}

export interface RequestOffer {
  id: string;
  requestPostId: string;
  ownerUid: string;
  ownerName: string;
  listingId: string;
  listing: {
    titleEn: string;
    isPublic: boolean;
    lendingMode: "free" | "paid";
    dailyRateHalalas: number;
    depositHalalas: number;
    primaryMediaId: string | null;
  } | null;
  message: string;
  status: "offered" | "selected" | "withdrawn";
  bookingId: string | null;
  createdAt: string;
}

export interface RequestPost {
  id: string;
  authorUid: string;
  authorName: string;
  title: string;
  description: string;
  categoryId: string;
  neighborhoodId: string;
  neighborhoodName: string;
  desiredStartAt: string;
  desiredEndAt: string;
  maxDailyRateHalalas: number | null;
  status: "open" | "fulfilled" | "closed" | "expired";
  offerCount: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  offers?: RequestOffer[];
}

// ─── Favorites ───

export const fetchFavorites = () => apiFetch<{ items: Favorite[] }>("/me/favorites");

export const saveFavorite = (
  listingId: string,
  body: { alertEnabled: boolean; desiredStartAt: string | null; desiredEndAt: string | null },
) => apiFetch<Favorite>(`/me/favorites/${encodeURIComponent(listingId)}`, { method: "PUT", body });

export const removeFavorite = (listingId: string) =>
  apiFetch<null>(`/me/favorites/${encodeURIComponent(listingId)}`, { method: "DELETE" });

// ─── Requests ───

export const fetchOpenRequests = () => apiFetch<{ items: RequestPost[] }>("/requests", { auth: false });
export const fetchMyRequests = () => apiFetch<{ items: RequestPost[] }>("/me/requests");
export const fetchRequest = (id: string) => apiFetch<RequestPost>(`/requests/${id}`, { auth: false });

export const createRequest = (body: {
  title: string;
  description: string;
  categoryId: string;
  neighborhoodId: string;
  desiredStartAt: string;
  desiredEndAt: string;
  maxDailyRateHalalas: number | null;
}) => apiFetch<RequestPost>("/me/requests", { method: "POST", body });

export const closeRequest = (id: string) => apiFetch<RequestPost>(`/me/requests/${id}/close`, { method: "POST" });

export const offerListing = (id: string, listingId: string, message: string) =>
  apiFetch<RequestPost>(`/me/requests/${id}/offers`, { method: "POST", body: { listingId, message } });

export const selectOffer = (id: string, offerId: string) =>
  apiFetch<{ offerId: string; listingId: string; startAt: string; endAt: string; reviewPath: string }>(
    `/me/requests/${id}/offers/${encodeURIComponent(offerId)}/select`,
    { method: "POST" },
  );

export const withdrawOffer = (id: string, offerId: string) =>
  apiFetch<RequestPost>(`/me/requests/${id}/offers/${encodeURIComponent(offerId)}/withdraw`, { method: "POST" });
