/**
 * Sprint 2 exchange configuration.
 *
 * DRAFT VALUES PENDING TEAM APPROVAL. These are development defaults taken
 * from the Sprint 2 plan (Section 6) and the dataset's configuration defaults.
 * They are not researched rental policies.
 */

export const BOOKING_CONFIG = {
  /** A pending request expires this many hours after it is sent (capped at pickup time). */
  pendingExpiryHours: 48,
  /** An accepted hold expires this many hours after acceptance (capped at pickup time). */
  acceptedHoldExpiryHours: 24,
  /** Pickup can be at most this many days ahead of now. */
  maxHorizonDays: 90,
  /** Used when a listing has no maximum billable days. */
  defaultMaximumBillableDays: 14,
  /** One billing unit is 24 hours, rounded up. */
  billingUnitHours: 24,
  /** Owner unavailable periods can be at most this long. */
  maxOwnerBlockDays: 365,
  maxConditionPhotos: 3,
  maxChecklistItems: 25,
  maxNoteLength: 1000,
  maxMessageLength: 1000,
  messagePreviewLength: 80,
  /** Polling while a conversation is open. */
  conversationPollMs: 5_000,
  /** Polling for the notification badge. */
  notificationPollMs: 30_000,
  /** Display time zone. Saudi Arabia has no daylight saving (UTC+03:00). */
  timeZone: "Asia/Riyadh",
  riyadhUtcOffset: "+03:00",
} as const;

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
