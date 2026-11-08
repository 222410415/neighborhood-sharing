/**
 * Listing service — business logic for listing lifecycle.
 *
 * Transitions: draft→published, published→paused, paused→published,
 * draft/published/paused→archived.
 */

import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { ListingRepository, type ListingDocument } from "./listing.repository.js";
import { MediaRepository } from "../media/media.repository.js";
import { CalendarGuardService } from "../exchange/calendar-guard.service.js";
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
  ValidationException,
} from "../../common/errors/api-exceptions.js";
import type { FieldError } from "@neighborhood/contracts";
import {
  MAX_DAILY_RATE_HALALAS,
  MAX_DEPOSIT_HALALAS,
  MAX_LISTING_IMAGES,
} from "@neighborhood/contracts";

// ─── Search token normalization ───

function normalizeToken(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function deriveSearchTokens(titleEn: string, titleAr?: string): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();
  const add = (t: string) => {
    const n = normalizeToken(t);
    if (n && !seen.has(n) && tokens.length < 96) {
      seen.add(n);
      tokens.push(n);
    }
  };

  if (titleEn) add(titleEn);
  if (titleAr) add(titleAr);
  if (titleEn) {
    for (const w of titleEn.split(/\s+/)) add(w);
  }
  if (titleAr) {
    for (const w of titleAr.split(/\s+/)) add(w);
  }
  if (titleEn) {
    const words = titleEn.split(/\s+/);
    for (let len = 2; len <= 3 && len <= words.length; len++) {
      for (let i = 0; i <= words.length - len; i++) {
        add(words.slice(i, i + len).join(" "));
      }
    }
  }
  return tokens;
}

// ─── Transition rules ───

const TRANSITIONS: Record<string, string[]> = {
  draft: ["published", "archived"],
  published: ["paused", "archived"],
  paused: ["published", "archived"],
  archived: [],
};

/** Statuses from which `target` may be reached; rechecked inside the transaction. */
function allowedFrom(target: string): string[] {
  return Object.keys(TRANSITIONS).filter((from) => TRANSITIONS[from]!.includes(target));
}

// ─── Validation helpers ───

function validateMoney(
  lendingMode: "free" | "paid",
  dailyRateHalalas: number | undefined,
  depositHalalas: number | undefined,
): FieldError[] {
  const errors: FieldError[] = [];

  if (lendingMode === "free") {
    if (dailyRateHalalas !== undefined && dailyRateHalalas !== 0) {
      errors.push({
        field: "dailyRateHalalas",
        message: "Daily rate must be zero for free lending",
      });
    }
  } else {
    if (dailyRateHalalas === undefined || dailyRateHalalas <= 0) {
      errors.push({
        field: "dailyRateHalalas",
        message: "Daily rate is required and must be positive for paid rental",
      });
    }
    if (dailyRateHalalas !== undefined && dailyRateHalalas > MAX_DAILY_RATE_HALALAS) {
      errors.push({
        field: "dailyRateHalalas",
        message: `Daily rate exceeds maximum (${MAX_DAILY_RATE_HALALAS} halalas)`,
      });
    }
  }

  if (depositHalalas !== undefined && depositHalalas < 0) {
    errors.push({
      field: "depositHalalas",
      message: "Deposit cannot be negative",
    });
  }
  if (depositHalalas !== undefined && depositHalalas > MAX_DEPOSIT_HALALAS) {
    errors.push({
      field: "depositHalalas",
      message: `Deposit exceeds maximum (${MAX_DEPOSIT_HALALAS} halalas)`,
    });
  }

  return errors;
}

function validatePublication(listing: Partial<ListingDocument>): string | null {
  if (!listing.titleEn || listing.titleEn.trim().length === 0) {
    return "Title is required to publish";
  }
  if (!listing.descriptionEn || listing.descriptionEn.trim().length === 0) {
    return "Description is required to publish";
  }
  if (!listing.categoryId) {
    return "Category is required to publish";
  }
  if (!listing.neighborhoodId) {
    return "Neighborhood is required to publish";
  }
  if (!listing.condition) {
    return "Condition is required to publish";
  }
  if (!listing.lendingMode) {
    return "Lending mode is required to publish";
  }
  if (listing.lendingMode === "paid" && (!listing.dailyRateHalalas || listing.dailyRateHalalas <= 0)) {
    return "Daily rate is required for paid rental";
  }
  // Photos are optional (decision D-40); listings without one show the
  // category illustration.
  return null;
}

@Injectable()
export class ListingService {
  constructor(
    private readonly listingRepo: ListingRepository,
    private readonly mediaRepo: MediaRepository,
    private readonly calendar: CalendarGuardService,
  ) {}

  /**
   * Create a new draft listing.
   * Deduplicates via clientSubmissionId.
   */
  async createDraft(
    ownerUid: string,
    body: {
      titleEn: string;
      descriptionEn: string;
      categoryId: string;
      neighborhoodId: string;
      condition: string;
      lendingMode: "free" | "paid";
      dailyRateHalalas?: number;
      depositHalalas?: number;
      clientSubmissionId?: string;
    },
  ): Promise<ListingDocument> {
    // Deduplicate via clientSubmissionId
    if (body.clientSubmissionId) {
      // Check if a listing with this clientSubmissionId already exists for this owner
      const existing = await this.listingRepo.getForOwner(ownerUid);
      const found = existing.find(
        (l) => (l as any).clientSubmissionId === body.clientSubmissionId,
      );
      if (found) return found;
    }

    // Validate money
    const moneyErrors = validateMoney(
      body.lendingMode,
      body.dailyRateHalalas,
      body.depositHalalas,
    );
    if (moneyErrors.length > 0) {
      throw new ValidationException(moneyErrors);
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const slug = body.titleEn.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 80);

    const listing: Partial<ListingDocument> = {
      id,
      slug,
      ownerUid,
      categoryId: body.categoryId,
      neighborhoodId: body.neighborhoodId,
      titleEn: body.titleEn,
      descriptionEn: body.descriptionEn,
      includedAccessories: [],
      condition: body.condition,
      status: "draft",
      lendingMode: body.lendingMode,
      currency: "SAR",
      dailyRateHalalas: body.lendingMode === "free" ? 0 : (body.dailyRateHalalas ?? 0),
      depositHalalas: body.depositHalalas ?? 0,
      billingUnit: "24_hours",
      minimumBillableDays: 1,
      maximumBillableDays: 14,
      inventoryUnits: 1,
      fulfillment: "agreed_pickup",
      primaryMediaId: null,
      mediaIds: [],
      searchTokens: deriveSearchTokens(body.titleEn),
      revision: 0,
      createdAt: now,
      updatedAt: now,
    };

    if (body.clientSubmissionId) {
      (listing as any).clientSubmissionId = body.clientSubmissionId;
    }

    await this.listingRepo.create(id, listing);
    return (await this.listingRepo.getById(id))!;
  }

  /**
   * Get owner's inventory, optionally filtered by status.
   */
  async getOwnerListings(ownerUid: string, status?: string): Promise<ListingDocument[]> {
    return this.listingRepo.getForOwner(ownerUid, status);
  }

  /**
   * Get a single listing for the owner (private edit record).
   */
  async getOwnerListing(id: string, ownerUid: string): Promise<ListingDocument> {
    const listing = await this.listingRepo.getByIdForOwner(id, ownerUid);
    if (!listing) {
      throw new NotFoundException("Listing not found");
    }
    return listing;
  }

  /**
   * Update a listing's content with field allowlist and expected revision.
   */
  async updateListing(
    id: string,
    ownerUid: string,
    body: {
      titleEn?: string;
      titleAr?: string;
      descriptionEn?: string;
      descriptionAr?: string;
      categoryId?: string;
      neighborhoodId?: string;
      condition?: string;
      lendingMode?: "free" | "paid";
      dailyRateHalalas?: number;
      depositHalalas?: number;
      expectedRevision: number;
    },
  ): Promise<ListingDocument> {
    const listing = await this.listingRepo.getByIdForOwner(id, ownerUid);
    if (!listing) {
      throw new NotFoundException("Listing not found");
    }

    if (listing.status === "archived") {
      throw new BadRequestException("Archived listings cannot be edited");
    }

    // Merge for validation
    const merged: Partial<ListingDocument> = { ...listing };
    if (body.titleEn !== undefined) merged.titleEn = body.titleEn;
    if (body.titleAr !== undefined) merged.titleAr = body.titleAr;
    if (body.descriptionEn !== undefined) merged.descriptionEn = body.descriptionEn;
    if (body.descriptionAr !== undefined) merged.descriptionAr = body.descriptionAr;
    if (body.categoryId !== undefined) merged.categoryId = body.categoryId;
    if (body.neighborhoodId !== undefined) merged.neighborhoodId = body.neighborhoodId;
    if (body.condition !== undefined) merged.condition = body.condition;
    if (body.lendingMode !== undefined) merged.lendingMode = body.lendingMode;
    if (body.dailyRateHalalas !== undefined) merged.dailyRateHalalas = body.dailyRateHalalas;
    if (body.depositHalalas !== undefined) merged.depositHalalas = body.depositHalalas;

    // Validate money on merged record
    const moneyErrors = validateMoney(
      merged.lendingMode as "free" | "paid",
      merged.dailyRateHalalas,
      merged.depositHalalas,
    );
    if (moneyErrors.length > 0) {
      throw new ValidationException(moneyErrors);
    }

    // If published, validate merged record still meets publication requirements
    if (listing.status === "published") {
      const pubError = validatePublication(merged);
      if (pubError) {
        throw new ValidationException([
          { field: "_form", message: pubError },
        ]);
      }
    }

    // Build update object with allowlisted fields only
    const updates: Record<string, unknown> = {};
    if (body.titleEn !== undefined) {
      updates["titleEn"] = body.titleEn;
      updates["searchTokens"] = deriveSearchTokens(body.titleEn, body.titleAr ?? listing.titleAr);
    }
    if (body.titleAr !== undefined) updates["titleAr"] = body.titleAr;
    if (body.descriptionEn !== undefined) updates["descriptionEn"] = body.descriptionEn;
    if (body.descriptionAr !== undefined) updates["descriptionAr"] = body.descriptionAr;
    if (body.categoryId !== undefined) updates["categoryId"] = body.categoryId;
    if (body.neighborhoodId !== undefined) updates["neighborhoodId"] = body.neighborhoodId;
    if (body.condition !== undefined) updates["condition"] = body.condition;
    if (body.lendingMode !== undefined) {
      updates["lendingMode"] = body.lendingMode;
      if (body.lendingMode === "free") {
        updates["dailyRateHalalas"] = 0;
      }
    }
    if (body.dailyRateHalalas !== undefined) updates["dailyRateHalalas"] = body.dailyRateHalalas;
    if (body.depositHalalas !== undefined) updates["depositHalalas"] = body.depositHalalas;

    const result = await this.listingRepo.updateWithRevision(id, body.expectedRevision, updates);

    if (!result.success) {
      if (result.error === "conflict" || result.error === "invalid_transition") {
        throw new ConflictException("This listing was edited by another session. Please refresh and try again.");
      }
      throw new NotFoundException("Listing not found");
    }

    return result.data!;
  }

  /**
   * Publish a draft or paused listing.
   */
  async publishListing(id: string, ownerUid: string, expectedRevision: number): Promise<ListingDocument> {
    const listing = await this.listingRepo.getByIdForOwner(id, ownerUid);
    if (!listing) {
      throw new NotFoundException("Listing not found");
    }

    if (!TRANSITIONS[listing.status]?.includes("published")) {
      throw new BadRequestException(`Cannot publish a ${listing.status} listing`);
    }

    // Validate publication requirements
    const pubError = validatePublication(listing);
    if (pubError) {
      throw new ValidationException([{ field: "_form", message: pubError }]);
    }

    const result = await this.listingRepo.updateStatus(
      id,
      expectedRevision,
      "published",
      allowedFrom("published"),
    );
    if (!result.success) {
      if (result.error === "conflict" || result.error === "invalid_transition") {
        throw new ConflictException("This listing was edited by another session. Please refresh and try again.");
      }
      throw new NotFoundException("Listing not found");
    }

    // Republishing after a lost or needs-repair dispute outcome makes the item bookable again.
    await this.calendar.clearItemHold(id);

    return result.data!;
  }

  /**
   * Pause a published listing.
   */
  async pauseListing(id: string, ownerUid: string, expectedRevision: number): Promise<ListingDocument> {
    const listing = await this.listingRepo.getByIdForOwner(id, ownerUid);
    if (!listing) {
      throw new NotFoundException("Listing not found");
    }

    if (!TRANSITIONS[listing.status]?.includes("paused")) {
      throw new BadRequestException(`Cannot pause a ${listing.status} listing`);
    }

    const result = await this.listingRepo.updateStatus(
      id,
      expectedRevision,
      "paused",
      allowedFrom("paused"),
    );
    if (!result.success) {
      if (result.error === "conflict" || result.error === "invalid_transition") {
        throw new ConflictException("This listing was edited by another session. Please refresh and try again.");
      }
      throw new NotFoundException("Listing not found");
    }

    return result.data!;
  }

  /**
   * Archive a draft, published, or paused listing. Soft and terminal.
   */
  async archiveListing(id: string, ownerUid: string, expectedRevision: number): Promise<ListingDocument> {
    const listing = await this.listingRepo.getByIdForOwner(id, ownerUid);
    if (!listing) {
      throw new NotFoundException("Listing not found");
    }

    if (!TRANSITIONS[listing.status]?.includes("archived")) {
      throw new BadRequestException(`Cannot archive a ${listing.status} listing`);
    }

    const result = await this.listingRepo.updateStatus(
      id,
      expectedRevision,
      "archived",
      allowedFrom("archived"),
    );
    if (!result.success) {
      if (result.error === "conflict" || result.error === "invalid_transition") {
        throw new ConflictException("This listing was edited by another session. Please refresh and try again.");
      }
      throw new NotFoundException("Listing not found");
    }

    return result.data!;
  }

  /**
   * Attach media to a listing transactionally.
   * Verifies every media belongs to the owner and is not already attached.
   */
  async attachMedia(
    listingId: string,
    ownerUid: string,
    mediaIds: string[],
  ): Promise<{ attached: string[]; rejected: { id: string; reason: string }[] }> {
    const listing = await this.listingRepo.getByIdForOwner(listingId, ownerUid);
    if (!listing) {
      throw new NotFoundException("Listing not found");
    }

    if (listing.status === "archived") {
      throw new BadRequestException("Cannot attach media to an archived listing");
    }

    // Check image count
    const currentCount = listing.mediaIds?.length ?? 0;
    const newCount = currentCount + mediaIds.length;
    if (newCount > MAX_LISTING_IMAGES) {
      throw new BadRequestException(`A listing can have at most ${MAX_LISTING_IMAGES} images`);
    }

    const result = await this.mediaRepo.attachToListing(mediaIds, listingId, ownerUid);

    // Update the listing document with the newly attached media IDs
    if (result.attached.length > 0) {
      const newMediaIds = [...(listing.mediaIds ?? []), ...result.attached];
      const updates: Record<string, unknown> = {
        mediaIds: newMediaIds,
      };
      // Set primary media if none exists
      if (!listing.primaryMediaId && newMediaIds.length > 0) {
        updates["primaryMediaId"] = newMediaIds[0]!;
      }
      await this.listingRepo.updateWithRevision(listingId, listing.revision, updates);
    }

    return result;
  }

  /**
   * Detach media from a listing.
   */
  async detachMedia(listingId: string, ownerUid: string, mediaId: string): Promise<void> {
    const listing = await this.listingRepo.getByIdForOwner(listingId, ownerUid);
    if (!listing) {
      throw new NotFoundException("Listing not found");
    }

    // Don't allow removing the final image of a published listing
    if (listing.status === "published" && listing.mediaIds.length <= 1) {
      throw new BadRequestException("Cannot remove the only image from a published listing");
    }

    if (!listing.mediaIds.includes(mediaId)) {
      throw new NotFoundException("Image not found on this listing");
    }

    await this.mediaRepo.detachFromListing(mediaId, ownerUid, listingId);

    // Update listing's mediaIds and primaryMediaId
    const newMediaIds = listing.mediaIds.filter((id) => id !== mediaId);
    const updates: Record<string, unknown> = {
      mediaIds: newMediaIds,
    };
    if (listing.primaryMediaId === mediaId) {
      updates["primaryMediaId"] = newMediaIds[0] ?? null;
    }

    await this.listingRepo.updateWithRevision(listingId, listing.revision, updates);
  }
}
