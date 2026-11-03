/**
 * Public listings API client — catalogue and item details.
 */

import { apiFetch } from "@/lib/api-client";

export interface PublicListingItem {
  id: string;
  slug: string;
  titleEn: string;
  titleAr?: string;
  neighborhoodId: string;
  neighborhoodName: string;
  categoryId: string;
  categoryName: string;
  lendingMode: "free" | "paid";
  dailyRateHalalas: number;
  depositHalalas: number;
  primaryMediaId: string | null;
}

export interface PublicListingDetail {
  id: string;
  slug: string;
  ownerId: string;
  /** Set by the API when the signed-in viewer owns the listing. */
  isOwner: boolean;
  categoryId: string;
  neighborhoodId: string;
  titleEn: string;
  titleAr?: string;
  descriptionEn: string;
  descriptionAr?: string;
  condition: string;
  includedAccessories: string[];
  lendingMode: "free" | "paid";
  currency: string;
  dailyRateHalalas: number;
  depositHalalas: number;
  billingUnit: string;
  minimumBillableDays: number;
  maximumBillableDays: number;
  fulfillment: string;
  primaryMediaId: string | null;
  /** Attribution for an openly licensed photo; null for member uploads. */
  primaryMediaCredit: {
    creator: string;
    license: string;
    licenseUrl: string | null;
    sourceUrl: string | null;
  } | null;
  mediaIds: string[];
  createdAt: string;
  owner: { displayName: string; neighborhoodId: string | null };
  neighborhood: { nameEn: string; nameAr: string } | null;
  category: { nameEn: string; nameAr: string; slug: string } | null;
}

export interface PaginatedListings {
  items: PublicListingItem[];
  nextCursor: string | null;
  hasMore: boolean;
  /** The server stopped after its scan budget; more matches may exist. */
  scanLimitReached?: boolean;
}

export async function fetchPublishedListings(opts: {
  category?: string;
  neighborhood?: string;
  lendingMode?: string;
  search?: string;
  from?: string;
  to?: string;
  minRate?: number;
  maxRate?: number;
  cursor?: string;
  pageSize?: number;
} = {}): Promise<PaginatedListings | null> {
  const params = new URLSearchParams();
  if (opts.category) params.set("category", opts.category);
  if (opts.neighborhood) params.set("neighborhood", opts.neighborhood);
  if (opts.lendingMode) params.set("lendingMode", opts.lendingMode);
  if (opts.search) params.set("search", opts.search);
  if (opts.from) params.set("from", opts.from);
  if (opts.to) params.set("to", opts.to);
  if (opts.minRate !== undefined) params.set("minRate", String(opts.minRate));
  if (opts.maxRate !== undefined) params.set("maxRate", String(opts.maxRate));
  if (opts.cursor) params.set("cursor", opts.cursor);
  if (opts.pageSize) params.set("pageSize", String(opts.pageSize));

  const query = params.toString();
  const res = await apiFetch<PaginatedListings>(
    `/listings${query ? `?${query}` : ""}`,
    { auth: false },
  );

  return res.data;
}

/** Sends the member's token when signed in so the API can set `isOwner`. */
export async function fetchPublishedDetail(id: string): Promise<PublicListingDetail | null> {
  const res = await apiFetch<PublicListingDetail>(`/listings/${id}`);
  return res.data;
}
