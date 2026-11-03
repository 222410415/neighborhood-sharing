import { z } from "zod";
import { idSchema } from "../common/limits";

/**
 * Reference data contracts — read-only location hierarchy and categories.
 * These are stable source IDs imported from the Saudi seed dataset.
 */

export const regionSchema = z.object({
  id: idSchema,
  nameEn: z.string(),
  nameAr: z.string(),
  capitalEn: z.string(),
  capitalAr: z.string(),
});

export const citySchema = z.object({
  id: idSchema,
  regionId: idSchema,
  nameEn: z.string(),
  nameAr: z.string(),
});

export const neighborhoodSchema = z.object({
  id: idSchema,
  cityId: idSchema,
  nameEn: z.string(),
  nameAr: z.string(),
  geometryStatus: z.string(),
});

export const categorySchema = z.object({
  id: idSchema,
  slug: z.string(),
  nameEn: z.string(),
  nameAr: z.string(),
  iconKey: z.string(),
  sortOrder: z.number().int(),
});

export const referenceDataResponseSchema = z.object({
  regions: z.array(regionSchema),
  cities: z.array(citySchema),
  neighborhoods: z.array(neighborhoodSchema),
  categories: z.array(categorySchema),
});

export type Region = z.infer<typeof regionSchema>;
export type City = z.infer<typeof citySchema>;
export type Neighborhood = z.infer<typeof neighborhoodSchema>;
export type Category = z.infer<typeof categorySchema>;
export type ReferenceDataResponse = z.infer<typeof referenceDataResponseSchema>;
