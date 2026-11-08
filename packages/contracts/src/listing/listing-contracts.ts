import { z } from "zod";
import {
  idSchema,
  currencySchema,
  halalasSchema,
  MAX_TITLE_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_ACCESSORY_LABEL_LENGTH,
  MAX_ACCESSORIES_COUNT,
  MAX_LISTING_IMAGES,
  MAX_DAILY_RATE_HALALAS,
  MAX_DEPOSIT_HALALAS,
  MAX_REPLACEMENT_HALALAS,
  MAX_SEARCH_TOKENS,
} from "../common/limits";

/**
 * Listing contracts.
 *
 * PublicListingDto — safe fields for catalogue/detail responses.
 * OwnerListingDto — full editable record including non-public listings.
 * ListingStorage — Firestore document shape with revision and timestamps.
 * CreateListingBody — input for POST /v1/me/listings (draft creation).
 * UpdateListingBody — input for PATCH /v1/me/listings/:id (allowlisted edits).
 */

export const listingStatusSchema = z.enum([
  "draft",
  "published",
  "paused",
  "archived",
]);

export const lendingModeSchema = z.enum(["free", "paid"]);

export const conditionSchema = z.enum([
  "new",
  "excellent",
  "good",
  "fair",
]);

export const billingUnitSchema = z.enum(["24_hours"]);

/** Sprint 2 booking configuration; approval is the default. */
export const listingBookingModeSchema = z.enum(["approval", "instant"]);

export const fulfillmentSchema = z.enum([
  "agreed_pickup",
  "agreed_meetup",
]);

export const accessoriesSchema = z
  .array(z.string().min(1).max(MAX_ACCESSORY_LABEL_LENGTH))
  .max(MAX_ACCESSORIES_COUNT);

export const searchTokensSchema = z
  .array(z.string().min(1).max(80))
  .max(MAX_SEARCH_TOKENS);

export const publicListingDtoSchema = z.object({
  id: idSchema,
  slug: z.string(),
  ownerId: idSchema,
  categoryId: idSchema,
  neighborhoodId: idSchema,
  titleEn: z.string(),
  titleAr: z.string().optional(),
  descriptionEn: z.string(),
  descriptionAr: z.string().optional(),
  condition: conditionSchema,
  includedAccessories: accessoriesSchema,
  lendingMode: lendingModeSchema,
  currency: currencySchema,
  dailyRateHalalas: halalasSchema,
  depositHalalas: halalasSchema,
  billingUnit: billingUnitSchema,
  minimumBillableDays: z.number().int().positive(),
  maximumBillableDays: z.number().int().positive(),
  fulfillment: fulfillmentSchema,
  primaryMediaId: idSchema.nullable(),
  mediaIds: z.array(idSchema).max(MAX_LISTING_IMAGES),
  status: listingStatusSchema,
  createdAt: z.string(),
});

export const ownerListingDtoSchema = publicListingDtoSchema.extend({
  specificationEn: z.string().optional(),
  estimatedReplacementHalalas: halalasSchema.optional(),
  pricingBasis: z.string().optional(),
  revision: z.number().int(),
  updatedAt: z.string().optional(),
  isDemo: z.boolean().optional(),
  bookingMode: listingBookingModeSchema.optional(),
  bookableFrom: z.string().nullable().optional(),
  bookableUntil: z.string().nullable().optional(),
});

export const listingStorageSchema = z.object({
  id: idSchema,
  slug: z.string(),
  ownerUid: idSchema,
  categoryId: idSchema,
  neighborhoodId: idSchema,
  titleEn: z.string().max(MAX_TITLE_LENGTH),
  titleAr: z.string().max(MAX_TITLE_LENGTH).optional(),
  descriptionEn: z.string().max(MAX_DESCRIPTION_LENGTH),
  descriptionAr: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
  specificationEn: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
  includedAccessories: accessoriesSchema,
  condition: conditionSchema,
  status: listingStatusSchema,
  lendingMode: lendingModeSchema,
  currency: currencySchema,
  dailyRateHalalas: halalasSchema.max(MAX_DAILY_RATE_HALALAS),
  depositHalalas: halalasSchema.max(MAX_DEPOSIT_HALALAS),
  estimatedReplacementHalalas: halalasSchema.max(MAX_REPLACEMENT_HALALAS).optional(),
  billingUnit: billingUnitSchema,
  minimumBillableDays: z.number().int().positive(),
  maximumBillableDays: z.number().int().positive(),
  inventoryUnits: z.number().int().positive(),
  fulfillment: fulfillmentSchema,
  primaryMediaId: idSchema.nullable(),
  mediaIds: z.array(idSchema).max(MAX_LISTING_IMAGES),
  pricingBasis: z.string().optional(),
  searchTokens: searchTokensSchema,
  revision: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
  isDemo: z.boolean().optional(),
  bookingMode: listingBookingModeSchema.optional(),
  bookableFrom: z.string().nullable().optional(),
  bookableUntil: z.string().nullable().optional(),
});

export const createListingBodySchema = z.object({
  titleEn: z.string().min(1).max(MAX_TITLE_LENGTH),
  titleAr: z.string().max(MAX_TITLE_LENGTH).optional(),
  descriptionEn: z.string().min(1).max(MAX_DESCRIPTION_LENGTH),
  descriptionAr: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
  categoryId: idSchema,
  neighborhoodId: idSchema,
  condition: conditionSchema,
  lendingMode: lendingModeSchema,
  // Free items send 0; the service requires a positive rate for paid items.
  dailyRateHalalas: halalasSchema.max(MAX_DAILY_RATE_HALALAS).optional(),
  depositHalalas: halalasSchema.max(MAX_DEPOSIT_HALALAS).optional(),
  clientSubmissionId: idSchema.optional(),
});

export const updateListingBodySchema = z.object({
  titleEn: z.string().min(1).max(MAX_TITLE_LENGTH).optional(),
  titleAr: z.string().max(MAX_TITLE_LENGTH).optional(),
  descriptionEn: z.string().min(1).max(MAX_DESCRIPTION_LENGTH).optional(),
  descriptionAr: z.string().max(MAX_DESCRIPTION_LENGTH).optional(),
  categoryId: idSchema.optional(),
  neighborhoodId: idSchema.optional(),
  condition: conditionSchema.optional(),
  lendingMode: lendingModeSchema.optional(),
  dailyRateHalalas: halalasSchema.max(MAX_DAILY_RATE_HALALAS).optional(),
  depositHalalas: halalasSchema.max(MAX_DEPOSIT_HALALAS).optional(),
  expectedRevision: z.number().int().nonnegative(),
});

export type PublicListingDto = z.infer<typeof publicListingDtoSchema>;
export type OwnerListingDto = z.infer<typeof ownerListingDtoSchema>;
export type ListingStorage = z.infer<typeof listingStorageSchema>;
export type CreateListingBody = z.infer<typeof createListingBodySchema>;
export type UpdateListingBody = z.infer<typeof updateListingBodySchema>;
export type ListingStatus = z.infer<typeof listingStatusSchema>;
export type LendingMode = z.infer<typeof lendingModeSchema>;
