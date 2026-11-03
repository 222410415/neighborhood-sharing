/**
 * Public listing service — joins owner summary, location, and category labels.
 * Returns only safe fields — no email, no private address, no verification assertions.
 */

import { Injectable } from "@nestjs/common";
import {
  PublicListingRepository,
  type CatalogueOptions,
  type PaginatedResult,
} from "./public-listing.repository.js";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";

interface OwnerSummary {
  displayName: string;
  neighborhoodId: string | null;
}

interface LocationLabel {
  nameEn: string;
  nameAr: string;
}

interface CategoryLabel {
  nameEn: string;
  nameAr: string;
  slug: string;
}

export interface PublicListingDetail {
  id: string;
  slug: string;
  /** Public owner reference (contract field name); stored as ownerUid. */
  ownerId: string;
  /** True when the signed-in viewer owns this listing. */
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
  mediaIds: string[];
  createdAt: string;
  owner: OwnerSummary;
  neighborhood: LocationLabel | null;
  category: CategoryLabel | null;
}

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

@Injectable()
export class PublicListingService {
  constructor(
    private readonly publicRepo: PublicListingRepository,
    private readonly firebase: FirebaseService,
  ) {}

  private async getOwnerSummaries(
    ownerUids: string[],
  ): Promise<Map<string, OwnerSummary>> {
    const map = new Map<string, OwnerSummary>();
    const uniqueUids = [...new Set(ownerUids)];

    for (const uid of uniqueUids) {
      const doc = await this.firebase.firestore
        .collection(COLLECTIONS.users)
        .doc(uid)
        .get();
      if (doc.exists) {
        const data = doc.data() as Record<string, unknown>;
        map.set(uid, {
          displayName: (data["displayName"] as string) ?? "User",
          neighborhoodId: (data["neighborhoodId"] as string) ?? null,
        });
      }
    }

    return map;
  }

  private async getLocationLabels(
    neighborhoodIds: string[],
  ): Promise<Map<string, LocationLabel>> {
    const map = new Map<string, LocationLabel>();
    const uniqueIds = [...new Set(neighborhoodIds)];

    for (const id of uniqueIds) {
      const doc = await this.firebase.firestore
        .collection(COLLECTIONS.neighborhoods)
        .doc(id)
        .get();
      if (doc.exists) {
        const data = doc.data() as Record<string, unknown>;
        map.set(id, {
          nameEn: (data["nameEn"] as string) ?? "",
          nameAr: (data["nameAr"] as string) ?? "",
        });
      }
    }

    return map;
  }

  private async getCategoryLabels(
    categoryIds: string[],
  ): Promise<Map<string, CategoryLabel>> {
    const map = new Map<string, CategoryLabel>();
    const uniqueIds = [...new Set(categoryIds)];

    for (const id of uniqueIds) {
      const doc = await this.firebase.firestore
        .collection(COLLECTIONS.categories)
        .doc(id)
        .get();
      if (doc.exists) {
        const data = doc.data() as Record<string, unknown>;
        map.set(id, {
          nameEn: (data["nameEn"] as string) ?? "",
          nameAr: (data["nameAr"] as string) ?? "",
          slug: (data["slug"] as string) ?? "",
        });
      }
    }

    return map;
  }

  /**
   * List published listings with filters, search, and pagination.
   * Joins neighborhood and category labels.
   */
  async listPublished(opts: CatalogueOptions): Promise<PaginatedResult<PublicListingItem>> {
    const result = await this.publicRepo.getPublishedListings(opts);

    // Batch join labels
    const neighborhoodIds = result.items.map((i) => i.neighborhoodId);
    const categoryIds = result.items.map((i) => i.categoryId);

    const [neighborhoodLabels, categoryLabels] = await Promise.all([
      this.getLocationLabels(neighborhoodIds),
      this.getCategoryLabels(categoryIds),
    ]);

    const items: PublicListingItem[] = result.items.map((listing) => ({
      id: listing.id,
      slug: listing.slug,
      titleEn: listing.titleEn,
      titleAr: listing.titleAr,
      neighborhoodId: listing.neighborhoodId,
      neighborhoodName: neighborhoodLabels.get(listing.neighborhoodId)?.nameEn ?? "",
      categoryId: listing.categoryId,
      categoryName: categoryLabels.get(listing.categoryId)?.nameEn ?? "",
      lendingMode: listing.lendingMode,
      dailyRateHalalas: listing.dailyRateHalalas,
      depositHalalas: listing.depositHalalas,
      primaryMediaId: listing.primaryMediaId,
    }));

    return {
      items,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
      scanLimitReached: result.scanLimitReached ?? false,
    };
  }

  /**
   * Get a single published listing detail with owner summary and labels.
   */
  async getPublishedDetail(
    id: string,
    viewerUid?: string,
  ): Promise<PublicListingDetail | null> {
    const listing = await this.publicRepo.getPublishedById(id);
    if (!listing) return null;

    // Join owner, neighborhood, category
    const [ownerMap, neighborhoodMap, categoryMap] = await Promise.all([
      this.getOwnerSummaries([listing.ownerUid]),
      this.getLocationLabels([listing.neighborhoodId]),
      this.getCategoryLabels([listing.categoryId]),
    ]);

    return {
      id: listing.id,
      slug: listing.slug,
      ownerId: listing.ownerUid,
      isOwner: !!viewerUid && viewerUid === listing.ownerUid,
      categoryId: listing.categoryId,
      neighborhoodId: listing.neighborhoodId,
      titleEn: listing.titleEn,
      titleAr: listing.titleAr,
      descriptionEn: listing.descriptionEn,
      descriptionAr: listing.descriptionAr,
      condition: listing.condition,
      includedAccessories: listing.includedAccessories ?? [],
      lendingMode: listing.lendingMode,
      currency: listing.currency,
      dailyRateHalalas: listing.dailyRateHalalas,
      depositHalalas: listing.depositHalalas,
      billingUnit: listing.billingUnit,
      minimumBillableDays: listing.minimumBillableDays,
      maximumBillableDays: listing.maximumBillableDays,
      fulfillment: listing.fulfillment,
      primaryMediaId: listing.primaryMediaId,
      mediaIds: listing.mediaIds ?? [],
      createdAt: listing.createdAt,
      owner: ownerMap.get(listing.ownerUid) ?? { displayName: "User", neighborhoodId: null },
      neighborhood: neighborhoodMap.get(listing.neighborhoodId) ?? null,
      category: categoryMap.get(listing.categoryId) ?? null,
    };
  }
}
