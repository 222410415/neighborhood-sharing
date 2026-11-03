import { z } from "zod";
import { idSchema, timestampSchema } from "../common/limits";
import { TRUST_CONFIG } from "./trust-config";
import { clientRequestIdSchema, expectedRevisionSchema } from "../booking/booking-contracts";

/**
 * Trust and safety contracts (Sprint 3): roles, audit, reviews, public
 * profiles, reports, disputes, verification and profile preferences.
 */

// ─── Roles and audit ───

export const roleSchema = z.enum(["member", "reviewer", "admin"]);
export type Role = z.infer<typeof roleSchema>;

export interface RolesDto {
  roles: Role[];
  isReviewer: boolean;
  isAdmin: boolean;
}

export interface AuditEventDto {
  id: string;
  actorUid: string;
  action: string;
  entityType: string;
  entityId: string;
  occurredAt: string;
  requestId: string | null;
  reason: string | null;
  summary: Record<string, string | number | boolean | null>;
}

// ─── Reviews ───

export const createReviewBodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(TRUST_CONFIG.maxReviewCommentLength).default(""),
});

export const hideReviewBodySchema = z.object({
  reason: z.string().trim().min(1, "Give a reason").max(300),
});

export type CreateReviewBody = z.infer<typeof createReviewBodySchema>;
export type HideReviewBody = z.infer<typeof hideReviewBodySchema>;

export interface ReviewDto {
  id: string;
  bookingId: string;
  authorUid: string;
  authorName: string;
  recipientUid: string;
  /** Role the reviewed member had in the exchange. */
  recipientRole: "owner" | "borrower";
  rating: number;
  comment: string;
  createdAt: string;
  moderationStatus: "visible" | "hidden";
}

export interface ReputationDto {
  reviewCount: number;
  averageRating: number | null;
}

export interface VerificationLabelDto {
  /** Only these two labels exist; a demonstration check never reads as identity verification. */
  label: "Email verified" | "Demo check (simulated)";
  isSimulated: boolean;
}

export interface MemberProfileDto {
  uid: string;
  displayName: string;
  neighborhoodName: string | null;
  biographyEn: string | null;
  memberSince: string | null;
  hasPhoto: boolean;
  verificationLabels: VerificationLabelDto[];
  reputation: ReputationDto;
  reviewsHidden: boolean;
}

// ─── Reports ───

export const reportTargetTypeSchema = z.enum(["listing", "message", "review", "member"]);
export const reportCategorySchema = z.enum([
  "unsafe",
  "misleading",
  "inappropriate",
  "harassment",
  "fraud",
  "spam",
  "other",
]);
export const reportStatusSchema = z.enum(["open", "in_review", "closed"]);

export const createReportBodySchema = z.object({
  targetType: reportTargetTypeSchema,
  targetId: idSchema,
  bookingId: idSchema.optional(),
  category: reportCategorySchema,
  description: z.string().trim().min(1, "Describe the problem").max(TRUST_CONFIG.maxReportDescriptionLength),
  evidenceMediaIds: z
    .array(idSchema)
    .max(TRUST_CONFIG.maxEvidencePhotos)
    .refine((ids) => new Set(ids).size === ids.length, "Photos must not repeat")
    .default([]),
  clientRequestId: clientRequestIdSchema,
});

export const closeReportBodySchema = z.object({
  outcome: z.enum(["no_action", "content_hidden", "member_warned", "escalated_to_dispute", "other"]),
  note: z.string().trim().min(1, "Record the reasoning").max(1000),
});

export type ReportTargetType = z.infer<typeof reportTargetTypeSchema>;
export type ReportCategory = z.infer<typeof reportCategorySchema>;
export type ReportStatus = z.infer<typeof reportStatusSchema>;
export type CreateReportBody = z.infer<typeof createReportBodySchema>;
export type CloseReportBody = z.infer<typeof closeReportBodySchema>;

export interface ReportDto {
  id: string;
  reporterUid: string;
  targetType: ReportTargetType;
  targetId: string;
  bookingId: string | null;
  category: ReportCategory;
  description: string;
  evidenceMediaIds: string[];
  status: ReportStatus;
  outcome: string | null;
  outcomeNote: string | null;
  assignedReviewerUid: string | null;
  disputeId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ─── Disputes ───

export const disputeIssueSchema = z.enum([
  "damage",
  "missing_accessory",
  "not_returned",
  "late_return",
  "conduct",
  "other",
]);
export const disputeStatusSchema = z.enum(["open", "in_review", "resolved"]);
export const itemOutcomeSchema = z.enum(["returned_ok", "returned_damaged", "lost", "needs_repair"]);

export const openDisputeBodySchema = z.object({
  expectedRevision: expectedRevisionSchema,
  issue: disputeIssueSchema,
  description: z.string().trim().min(1, "Describe the issue").max(TRUST_CONFIG.maxStatementLength),
});

export const disputeStatementBodySchema = z.object({
  text: z.string().trim().min(1, "Write your statement").max(TRUST_CONFIG.maxStatementLength),
});

export const resolveDisputeBodySchema = z.object({
  expectedRevision: expectedRevisionSchema,
  rationale: z.string().trim().min(1, "Record the reasoning").max(TRUST_CONFIG.maxRationaleLength),
  itemOutcome: itemOutcomeSchema,
  refundHalalas: z.number().int().nonnegative(),
  compensationHalalas: z.number().int().nonnegative(),
});

export type DisputeIssue = z.infer<typeof disputeIssueSchema>;
export type DisputeStatus = z.infer<typeof disputeStatusSchema>;
export type ItemOutcome = z.infer<typeof itemOutcomeSchema>;
export type OpenDisputeBody = z.infer<typeof openDisputeBodySchema>;
export type DisputeStatementBody = z.infer<typeof disputeStatementBodySchema>;
export type ResolveDisputeBody = z.infer<typeof resolveDisputeBodySchema>;

export interface DisputeStatementDto {
  byUid: string;
  byRole: "owner" | "borrower" | "reviewer";
  text: string;
  at: string;
}

export interface DisputeResolutionDto {
  rationale: string;
  itemOutcome: ItemOutcome;
  depositAllocation: { refundHalalas: number; compensationHalalas: number };
}

export interface DisputeDto {
  id: string;
  bookingId: string;
  /** exchange: opened during the exchange (booking disputed); complaint: after completion, no money moves. */
  kind: "exchange" | "complaint";
  openedByUid: string;
  issue: DisputeIssue;
  description: string;
  linkedConditionReportIds: string[];
  linkedReportIds: string[];
  statements: DisputeStatementDto[];
  status: DisputeStatus;
  assignedReviewerUid: string | null;
  resolution: DisputeResolutionDto | null;
  resolvedByUid: string | null;
  resolvedAt: string | null;
  heldDepositHalalas: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Verification ───

export const verificationTypeSchema = z.enum(["email", "phone_demo", "identity_demo"]);
export const verificationStatusValueSchema = z.enum(["pending", "verified", "rejected"]);

export const demoCheckBodySchema = z.object({
  type: z.enum(["phone_demo", "identity_demo"]),
});

export const decideVerificationBodySchema = z.object({
  decision: z.enum(["verified", "rejected"]),
  reasonCode: z.string().trim().min(1).max(80),
});

export type VerificationType = z.infer<typeof verificationTypeSchema>;
export type DemoCheckBody = z.infer<typeof demoCheckBodySchema>;
export type DecideVerificationBody = z.infer<typeof decideVerificationBodySchema>;

export interface VerificationCheckDto {
  id: string;
  subjectUid: string;
  type: VerificationType;
  method: string;
  status: z.infer<typeof verificationStatusValueSchema>;
  isSimulated: boolean;
  reviewerUid: string | null;
  checkedAt: string | null;
  reasonCode: string | null;
  createdAt: string;
}

export interface VerificationStatusDto {
  emailVerified: boolean;
  checks: VerificationCheckDto[];
  labels: VerificationLabelDto[];
}

// ─── Profile preferences (extension of PATCH /me/profile) ───

export const privacyPreferencesSchema = z.object({
  showNeighborhood: z.boolean(),
  showReviews: z.boolean(),
});

export const notificationPreferencesSchema = z.object({
  /** Booking and case notices are always on; these categories are optional. */
  messages: z.boolean(),
  community: z.boolean(),
  alerts: z.boolean(),
});

export type PrivacyPreferences = z.infer<typeof privacyPreferencesSchema>;
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

/** Privacy-preserving defaults for members who never chose. */
export const DEFAULT_PRIVACY_PREFERENCES: PrivacyPreferences = {
  showNeighborhood: false,
  showReviews: true,
};

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  messages: true,
  community: true,
  alerts: true,
};

export const auditQuerySchema = z.object({
  entityType: z.string().max(40).optional(),
  entityId: idSchema.optional(),
  since: timestampSchema.optional(),
});
