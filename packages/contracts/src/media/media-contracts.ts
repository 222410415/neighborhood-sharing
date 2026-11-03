import { z } from "zod";
import { idSchema } from "../common/limits";

/**
 * Media contracts.
 *
 * PublicMediaMetaDto — safe metadata for public image access.
 * OwnerMediaMetaDto — full metadata including private fields.
 * MediaStorage — Firestore document shape with Base64 payloads.
 *
 * Base64 fields are exempt from Firestore indexing.
 * The actual image bytes are stored as Base64 strings in separate
 * media documents, not in the listing document.
 */

export const mediaUploadStateSchema = z.enum([
  "pending",
  "attached",
  "orphaned",
]);

export const mediaVariantSchema = z.enum(["main", "thumbnail"]);

/**
 * What an image is for. Listing images follow listing visibility; condition
 * photos are private to the two booking participants and never public.
 * Documents written before Sprint 2 have no purpose and are listing images.
 */
export const mediaPurposeSchema = z.enum(["listing", "condition", "profile", "report"]);
export const mediaParentTypeSchema = z.enum(["listing", "conditionReport", "profile", "report"]);

export const publicMediaMetaDtoSchema = z.object({
  id: idSchema,
  mimeType: z.string(),
  variant: mediaVariantSchema,
});

/**
 * Owner view of a media document, matching the stored fields (Sprint 3 aligned
 * the contract with the repository: two variants per document, separate sizes).
 */
export const ownerMediaMetaDtoSchema = z.object({
  id: idSchema,
  ownerUid: idSchema,
  listingId: idSchema.nullable(),
  uploadState: mediaUploadStateSchema,
  mimeType: z.string(),
  /** Stored main image dimensions (after resizing). */
  widthPx: z.number().int().positive(),
  heightPx: z.number().int().positive(),
  thumbnailWidthPx: z.number().int().positive().optional(),
  thumbnailHeightPx: z.number().int().positive().optional(),
  /** Uploaded original dimensions (the original itself is not stored). */
  originalWidthPx: z.number().int().positive().optional(),
  originalHeightPx: z.number().int().positive().optional(),
  mainSizeBytes: z.number().int().positive(),
  thumbnailSizeBytes: z.number().int().positive(),
  checksum: z.string(),
  createdAt: z.string(),
  expiresAt: z.string().nullable().optional(),
  isDemo: z.boolean().optional(),
  purpose: mediaPurposeSchema.optional(),
  parentType: mediaParentTypeSchema.nullable().optional(),
  parentId: idSchema.nullable().optional(),
  bookingId: idSchema.nullable().optional(),
});

/** Firestore document: owner metadata plus the Base64 payloads (never indexed). */
export const mediaStorageSchema = ownerMediaMetaDtoSchema.extend({
  mainBase64: z.string(),
  thumbnailBase64: z.string(),
  clientSubmissionId: z.string().nullable().optional(),
});

export type PublicMediaMetaDto = z.infer<typeof publicMediaMetaDtoSchema>;
export type OwnerMediaMetaDto = z.infer<typeof ownerMediaMetaDtoSchema>;
export type MediaStorage = z.infer<typeof mediaStorageSchema>;
export type MediaUploadState = z.infer<typeof mediaUploadStateSchema>;
export type MediaVariant = z.infer<typeof mediaVariantSchema>;
export type MediaPurpose = z.infer<typeof mediaPurposeSchema>;
