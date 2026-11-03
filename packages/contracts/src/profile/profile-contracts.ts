import { z } from "zod";
import { idSchema, localeSchema, MAX_BIOGRAPHY_LENGTH } from "../common/limits";

/**
 * Profile contracts.
 *
 * PublicProfileDto — safe fields shown to other users (no email).
 * PrivateProfileDto — full fields for the authenticated user themselves.
 * ProfileStorage — Firestore document shape (server-controlled fields separate).
 * CreateProfileBody — input for PUT /v1/me/profile (repeatable first-time setup).
 * UpdateProfileBody — input for PATCH /v1/me/profile (allowlisted changes).
 */

export const verificationStatusSchema = z.enum([
  "unverified",
  "pending",
  "demo_verified",
]);

export const accountStatusSchema = z.enum(["active", "suspended"]);

export const publicProfileDtoSchema = z.object({
  uid: idSchema,
  displayName: z.string(),
  neighborhoodId: idSchema.nullable(),
  biographyEn: z.string().optional(),
  biographyAr: z.string().optional(),
  verificationStatus: verificationStatusSchema,
  completedProfile: z.boolean(),
});

export const privateProfileDtoSchema = z.object({
  uid: idSchema,
  email: z.string().email(),
  displayName: z.string(),
  neighborhoodId: idSchema.nullable(),
  regionId: idSchema.nullable(),
  cityId: idSchema.nullable(),
  preferredLocale: localeSchema,
  biographyEn: z.string().optional(),
  biographyAr: z.string().optional(),
  verificationStatus: verificationStatusSchema,
  accountStatus: accountStatusSchema,
  completedProfile: z.boolean(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  profileMediaId: idSchema.nullable().optional(),
  privacyPreferences: z.object({ showNeighborhood: z.boolean(), showReviews: z.boolean() }).optional(),
  notificationPreferences: z
    .object({ messages: z.boolean(), community: z.boolean(), alerts: z.boolean() })
    .optional(),
});

export const profileStorageSchema = z.object({
  uid: idSchema,
  email: z.string().email(),
  displayName: z.string(),
  neighborhoodId: idSchema.nullable(),
  regionId: idSchema.nullable(),
  cityId: idSchema.nullable(),
  preferredLocale: localeSchema.default("en-SA"),
  biographyEn: z.string().optional(),
  biographyAr: z.string().optional(),
  verificationStatus: verificationStatusSchema.default("unverified"),
  accountStatus: accountStatusSchema.default("active"),
  completedProfile: z.boolean().default(false),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  profileMediaId: idSchema.nullable().optional(),
  privacyPreferences: z.object({ showNeighborhood: z.boolean(), showReviews: z.boolean() }).optional(),
  notificationPreferences: z
    .object({ messages: z.boolean(), community: z.boolean(), alerts: z.boolean() })
    .optional(),
});

export const createProfileBodySchema = z.object({
  displayName: z.string().min(1).max(100),
  neighborhoodId: idSchema,
  preferredLocale: localeSchema.optional(),
  biographyEn: z.string().max(MAX_BIOGRAPHY_LENGTH).optional(),
  biographyAr: z.string().max(MAX_BIOGRAPHY_LENGTH).optional(),
});

export const updateProfileBodySchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  neighborhoodId: idSchema.optional(),
  preferredLocale: localeSchema.optional(),
  biographyEn: z.string().max(MAX_BIOGRAPHY_LENGTH).optional(),
  biographyAr: z.string().max(MAX_BIOGRAPHY_LENGTH).optional(),
  // Sprint 3: profile photo (a "profile" media upload, or null to remove) and preferences
  profileMediaId: idSchema.nullable().optional(),
  privacyPreferences: z
    .object({ showNeighborhood: z.boolean(), showReviews: z.boolean() })
    .optional(),
  notificationPreferences: z
    .object({ messages: z.boolean(), community: z.boolean(), alerts: z.boolean() })
    .optional(),
});

export type PublicProfileDto = z.infer<typeof publicProfileDtoSchema>;
export type PrivateProfileDto = z.infer<typeof privateProfileDtoSchema>;
export type ProfileStorage = z.infer<typeof profileStorageSchema>;
export type CreateProfileBody = z.infer<typeof createProfileBodySchema>;
export type UpdateProfileBody = z.infer<typeof updateProfileBodySchema>;
