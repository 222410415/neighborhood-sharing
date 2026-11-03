/**
 * Image processing limits — centralized configuration, not scattered magic numbers.
 * These are technical input limits, not researched rental policies.
 */

export const IMAGE_LIMITS = {
  // Input limits (per file)
  MAX_INPUT_BYTES: 5 * 1024 * 1024, // 5 MiB
  MAX_PIXELS: 20_000_000, // 20 megapixels
  MIN_DIMENSION: 1,

  // Accepted formats (detected by Sharp, not by extension/MIME)
  ACCEPTED_FORMATS: ["jpeg", "png", "webp"] as const,

  // Rejected formats
  REJECTED_FORMATS: ["svg", "gif", "tiff", "avif", "heif"] as const,

  // Processed output limits
  MAIN_MAX_LONG_SIDE: 1600, // px
  MAIN_MAX_BYTES: 200 * 1024, // 200 KiB
  THUMBNAIL_MAX_LONG_SIDE: 480, // px
  THUMBNAIL_MAX_BYTES: 24 * 1024, // 24 KiB

  // Quality reduction steps for meeting size limits
  QUALITY_STEPS: [85, 80, 75, 70, 65, 60, 55, 50],

  // Listing limits
  MAX_IMAGES_PER_LISTING: 3,

  // Pending upload expiry (24 hours)
  PENDING_EXPIRY_HOURS: 24,

  // Processing concurrency
  MAX_CONCURRENT_PROCESSING: 4,
} as const;

export type AcceptedFormat = (typeof IMAGE_LIMITS.ACCEPTED_FORMATS)[number];

export const MEDIA_ERROR_CODES = {
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  DIMENSIONS_TOO_LARGE: "DIMENSIONS_TOO_LARGE",
  UNSUPPORTED_FORMAT: "UNSUPPORTED_FORMAT",
  ANIMATED_REJECTED: "ANIMATED_REJECTED",
  PROCESSING_FAILED: "PROCESSING_FAILED",
  OUTPUT_TOO_LARGE: "OUTPUT_TOO_LARGE",
  INVALID_BASE64: "INVALID_BASE64",
  MEDIA_NOT_FOUND: "MEDIA_NOT_FOUND",
  NOT_OWNER: "NOT_OWNER",
  ALREADY_ATTACHED: "ALREADY_ATTACHED",
  PENDING_EXPIRED: "PENDING_EXPIRED",
  IDEMPOTENCY_CONFLICT: "IDEMPOTENCY_CONFLICT",
} as const;
