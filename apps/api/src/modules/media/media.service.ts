/**
 * Media service — business logic for image upload, read, attach/detach, delete, cleanup.
 */

import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { MediaRepository, type MediaDocument } from "./media.repository.js";
import { ListingRepository } from "../listings/listing.repository.js";
import { processImage } from "./image-processor.js";
import { decodeImageBytes } from "./base64-helpers.js";
import { IMAGE_LIMITS } from "./image-config.js";
import {
  PayloadTooLargeException,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from "../../common/errors/api-exceptions.js";

@Injectable()
export class MediaService {
  constructor(
    private readonly mediaRepo: MediaRepository,
    private readonly listingRepo: ListingRepository,
  ) {}

  /**
   * Upload a single image. Processes with Sharp, stores as Base64 in Firestore.
   * Uses clientSubmissionId for idempotency.
   */
  async upload(
    ownerUid: string,
    fileBuffer: Buffer,
    clientSubmissionId?: string,
    purpose: "listing" | "condition" | "profile" | "report" = "listing",
  ): Promise<{ mediaId: string; meta: Omit<MediaDocument, "mainBase64" | "thumbnailBase64"> }> {
    // Idempotency check
    if (clientSubmissionId) {
      const existing = await this.mediaRepo.getByClientSubmissionId(ownerUid, clientSubmissionId);
      if (existing) {
        const { mainBase64: _m, thumbnailBase64: _t, ...meta } = existing;
        return { mediaId: existing.id, meta };
      }
    }

    // Process the image
    let processed;
    try {
      processed = await processImage(fileBuffer);
    } catch (err: any) {
      const msg = err.message ?? "Processing failed";
      if (msg.includes("too large") && msg.includes("bytes")) {
        throw new PayloadTooLargeException(msg);
      }
      if (msg.includes("Unsupported format") || msg.includes("not an image")) {
        throw new BadRequestException(msg);
      }
      if (msg.includes("Animated") || msg.includes("multipage")) {
        throw new BadRequestException(msg);
      }
      if (msg.includes("too large") && msg.includes("pixels")) {
        throw new PayloadTooLargeException(msg);
      }
      throw new BadRequestException(`Image processing failed: ${msg}`);
    }

    const mediaId = randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + IMAGE_LIMITS.PENDING_EXPIRY_HOURS * 60 * 60 * 1000);

    const doc: MediaDocument = {
      id: mediaId,
      ownerUid,
      listingId: null,
      uploadState: "pending",
      mimeType: processed.mimeType,
      widthPx: processed.widthPx,
      heightPx: processed.heightPx,
      thumbnailWidthPx: processed.thumbnailWidthPx,
      thumbnailHeightPx: processed.thumbnailHeightPx,
      originalWidthPx: processed.originalWidthPx,
      originalHeightPx: processed.originalHeightPx,
      mainSizeBytes: processed.mainSizeBytes,
      thumbnailSizeBytes: processed.thumbnailSizeBytes,
      checksum: processed.checksum,
      mainBase64: processed.mainBase64,
      thumbnailBase64: processed.thumbnailBase64,
      clientSubmissionId: clientSubmissionId ?? null,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      isDemo: false,
      purpose,
      parentType: null,
      parentId: null,
    };

    await this.mediaRepo.create(doc);

    const { mainBase64: _m, thumbnailBase64: _t, ...meta } = doc;
    return { mediaId, meta };
  }

  /**
   * Get media bytes for the owner (private access, any state).
   * Returns decoded bytes + content type.
   */
  async getOwnerMedia(
    mediaId: string,
    ownerUid: string,
    variant: "main" | "thumbnail" = "main",
  ): Promise<{ bytes: Buffer; mimeType: string } | null> {
    const media = await this.mediaRepo.getByIdForOwner(mediaId, ownerUid);
    if (!media) return null;

    const base64 = variant === "main" ? media.mainBase64 : media.thumbnailBase64;
    try {
      const bytes = decodeImageBytes(base64);
      return { bytes, mimeType: media.mimeType };
    } catch {
      return null;
    }
  }

  /**
   * Get media bytes for public access.
   * Checks that the parent listing is currently published.
   */
  async getPublicMedia(
    mediaId: string,
    variant: "main" | "thumbnail" = "main",
  ): Promise<{ bytes: Buffer; mimeType: string } | null> {
    const media = await this.mediaRepo.getById(mediaId);
    if (!media) return null;

    // Must be a listing image attached to a listing. Condition photos and
    // other private purposes are never served here.
    if (media.purpose && media.purpose !== "listing") return null;
    if (!media.listingId) return null;

    // Parent listing must be published
    const isPublished = await this.listingRepo.isPublished(media.listingId);
    if (!isPublished) return null;

    const base64 = variant === "main" ? media.mainBase64 : media.thumbnailBase64;
    try {
      const bytes = decodeImageBytes(base64);
      return { bytes, mimeType: media.mimeType };
    } catch {
      return null;
    }
  }

  /**
   * Attach media to a listing (called transactionally by Phase 07).
   * Verifies every media belongs to the owner and is not already attached.
   */
  async attachToListing(
    mediaIds: string[],
    listingId: string,
    ownerUid: string,
  ): Promise<{ attached: string[]; rejected: { id: string; reason: string }[] }> {
    return this.mediaRepo.attachToListing(mediaIds, listingId, ownerUid);
  }

  /**
   * Detach media from a listing.
   */
  async detachFromListing(mediaId: string, ownerUid: string): Promise<void> {
    await this.mediaRepo.detachFromListing(mediaId, ownerUid);
  }

  /**
   * Delete an unattached upload (owner only, must be pending or orphaned).
   */
  async deleteUpload(mediaId: string, ownerUid: string): Promise<void> {
    const media = await this.mediaRepo.getByIdForOwner(mediaId, ownerUid);
    if (!media) {
      throw new NotFoundException("Media not found");
    }

    if (media.uploadState === "attached") {
      throw new ConflictException("Cannot delete an attached media. Detach it first.");
    }

    await this.mediaRepo.delete(mediaId);
  }

  /**
   * Clean up stale pending uploads older than the expiry time.
   * Rechecks attachment state before deletion.
   * Returns count of deleted items.
   */
  async cleanupStalePending(dryRun = true): Promise<{ scanned: number; deleted: number; dryRun: boolean }> {
    const olderThan = new Date();
    const stale = await this.mediaRepo.getStalePending(olderThan);

    let deleted = 0;
    for (const media of stale) {
      // Recheck: don't delete if somehow attached
      if (media.uploadState === "attached" || media.listingId !== null) {
        continue;
      }

      if (!dryRun) {
        await this.mediaRepo.delete(media.id);
      }
      deleted++;
    }

    return { scanned: stale.length, deleted, dryRun };
  }
}
