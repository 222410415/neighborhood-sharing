import { z } from "zod";

/**
 * Shared validation limits used across multiple contracts.
 * These are technical input limits, not researched rental policies.
 */

export const MAX_TITLE_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 2000;
export const MAX_BIOGRAPHY_LENGTH = 280;
export const MAX_ACCESSORY_LABEL_LENGTH = 80;
export const MAX_ACCESSORIES_COUNT = 20;
export const MAX_SEARCH_TOKENS = 96;
export const MAX_LISTING_IMAGES = 3;

export const MAX_DAILY_RATE_HALALAS = 1_000_000;
export const MAX_DEPOSIT_HALALAS = 500_000;
export const MAX_REPLACEMENT_HALALAS = 10_000_000;

export const localeSchema = z.enum(["en-SA", "ar-SA"]);
export const currencySchema = z.enum(["SAR"]);

export const halalasSchema = z
  .number()
  .int("Must be an integer")
  .nonnegative("Must be non-negative")
  .safe("Must be a safe integer");

export const positiveHalalasSchema = halalasSchema.refine(
  (v) => v > 0,
  "Must be positive",
);

export const idSchema = z.string().min(1).max(128);

export const timestampSchema = z.string().datetime({ offset: true });
