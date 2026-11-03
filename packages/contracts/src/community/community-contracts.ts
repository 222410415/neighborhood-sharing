import { z } from "zod";
import { halalasSchema, idSchema, timestampSchema } from "../common/limits";
import { TRUST_CONFIG } from "../trust/trust-config";
import { expectedRevisionSchema } from "../booking/booking-contracts";

/**
 * Community contracts (Sprint 3): favorites with availability alerts,
 * community requests with owner offers, and Explore filters.
 */

// ─── Favorites ───

export const saveFavoriteBodySchema = z
  .object({
    alertEnabled: z.boolean().default(false),
    desiredStartAt: timestampSchema.nullable().default(null),
    desiredEndAt: timestampSchema.nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if ((v.desiredStartAt === null) !== (v.desiredEndAt === null)) {
      ctx.addIssue({ code: "custom", path: ["desiredEndAt"], message: "Choose both dates, or neither" });
      return;
    }
    if (v.desiredStartAt && v.desiredEndAt && Date.parse(v.desiredEndAt) <= Date.parse(v.desiredStartAt)) {
      ctx.addIssue({ code: "custom", path: ["desiredEndAt"], message: "The end must be after the start" });
    }
    if (v.alertEnabled && !v.desiredStartAt) {
      ctx.addIssue({ code: "custom", path: ["alertEnabled"], message: "Alerts need the dates you want" });
    }
  });

export type SaveFavoriteBody = z.infer<typeof saveFavoriteBodySchema>;

export interface FavoriteDto {
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
  /** Availability for the desired dates right now (null without dates). */
  availableForDates: boolean | null;
}

// ─── Community requests and offers ───

export const requestStatusSchema = z.enum(["open", "fulfilled", "closed", "expired"]);
export const offerStatusSchema = z.enum(["offered", "selected", "withdrawn"]);

const requestFields = {
  title: z.string().trim().min(1, "Say what you need").max(TRUST_CONFIG.maxRequestTitleLength),
  description: z.string().trim().max(TRUST_CONFIG.maxRequestDescriptionLength).default(""),
  categoryId: idSchema,
  neighborhoodId: idSchema,
  desiredStartAt: timestampSchema,
  desiredEndAt: timestampSchema,
  maxDailyRateHalalas: halalasSchema.max(1_000_000).nullable().default(null),
};

export const createRequestBodySchema = z
  .object(requestFields)
  .refine((v) => Date.parse(v.desiredEndAt) > Date.parse(v.desiredStartAt), {
    path: ["desiredEndAt"],
    message: "The end must be after the start",
  });

export const updateRequestBodySchema = z
  .object({
    title: requestFields.title.optional(),
    description: z.string().trim().max(TRUST_CONFIG.maxRequestDescriptionLength).optional(),
    categoryId: idSchema.optional(),
    neighborhoodId: idSchema.optional(),
    desiredStartAt: timestampSchema.optional(),
    desiredEndAt: timestampSchema.optional(),
    maxDailyRateHalalas: halalasSchema.max(1_000_000).nullable().optional(),
    expectedRevision: expectedRevisionSchema,
  });

export const createOfferBodySchema = z.object({
  listingId: idSchema,
  message: z.string().trim().max(TRUST_CONFIG.maxOfferMessageLength).default(""),
});

export type RequestStatus = z.infer<typeof requestStatusSchema>;
export type OfferStatus = z.infer<typeof offerStatusSchema>;
export type CreateRequestBody = z.infer<typeof createRequestBodySchema>;
export type UpdateRequestBody = z.infer<typeof updateRequestBodySchema>;
export type CreateOfferBody = z.infer<typeof createOfferBodySchema>;

export interface RequestOfferDto {
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
  status: OfferStatus;
  bookingId: string | null;
  createdAt: string;
}

export interface RequestPostDto {
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
  status: RequestStatus;
  offerCount: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
  /** Present on the detail view. */
  offers?: RequestOfferDto[];
}

/** What choosing an offer returns: the booking review to open (nothing is reserved). */
export interface OfferSelectionDto {
  offerId: string;
  listingId: string;
  startAt: string;
  endAt: string;
  reviewPath: string;
}

// ─── Explore filters (GET /listings) ───

export const catalogueQuerySchema = z.object({
  category: idSchema.optional(),
  neighborhood: idSchema.optional(),
  lendingMode: z.enum(["free", "paid"]).optional(),
  search: z.string().trim().max(120).optional(),
  from: timestampSchema.optional(),
  to: timestampSchema.optional(),
  minRate: z.coerce.number().int().nonnegative().optional(),
  maxRate: z.coerce.number().int().nonnegative().optional(),
  cursor: z.string().max(200).optional(),
  pageSize: z.coerce.number().int().min(1).max(24).optional(),
});

export type CatalogueQuery = z.infer<typeof catalogueQuerySchema>;
