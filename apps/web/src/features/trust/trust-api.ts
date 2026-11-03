/**
 * Trust and safety API client (Sprint 3): roles, reviews, public profiles,
 * reports, disputes, verification and the reviewer workspace.
 */

import { apiFetch } from "@/lib/api-client";

// ─── Types (mirror packages/contracts) ───

export interface Roles {
  roles: ("member" | "reviewer" | "admin")[];
  isReviewer: boolean;
  isAdmin: boolean;
}

export interface Review {
  id: string;
  bookingId: string;
  authorUid: string;
  authorName: string;
  recipientUid: string;
  recipientRole: "owner" | "borrower";
  rating: number;
  comment: string;
  createdAt: string;
  moderationStatus: "visible" | "hidden";
}

export interface VerificationLabel {
  label: "Email verified" | "Demo check (simulated)";
  isSimulated: boolean;
}

export interface MemberProfile {
  uid: string;
  displayName: string;
  neighborhoodName: string | null;
  biographyEn: string | null;
  memberSince: string | null;
  hasPhoto: boolean;
  verificationLabels: VerificationLabel[];
  reputation: { reviewCount: number; averageRating: number | null };
  reviewsHidden: boolean;
}

export type ReportTargetType = "listing" | "message" | "review" | "member";
export type ReportCategory = "unsafe" | "misleading" | "inappropriate" | "harassment" | "fraud" | "spam" | "other";

export interface Report {
  id: string;
  reporterUid: string;
  targetType: ReportTargetType;
  targetId: string;
  bookingId: string | null;
  category: ReportCategory;
  description: string;
  evidenceMediaIds: string[];
  status: "open" | "in_review" | "closed";
  outcome: string | null;
  outcomeNote: string | null;
  assignedReviewerUid: string | null;
  disputeId: string | null;
  createdAt: string;
  updatedAt: string;
}

export type DisputeIssue = "damage" | "missing_accessory" | "not_returned" | "late_return" | "conduct" | "other";
export type ItemOutcome = "returned_ok" | "returned_damaged" | "lost" | "needs_repair";

export interface Dispute {
  id: string;
  bookingId: string;
  kind: "exchange" | "complaint";
  openedByUid: string;
  issue: DisputeIssue;
  description: string;
  linkedConditionReportIds: string[];
  linkedReportIds: string[];
  statements: { byUid: string; byRole: "owner" | "borrower" | "reviewer"; text: string; at: string }[];
  status: "open" | "in_review" | "resolved";
  assignedReviewerUid: string | null;
  resolution: {
    rationale: string;
    itemOutcome: ItemOutcome;
    depositAllocation: { refundHalalas: number; compensationHalalas: number };
  } | null;
  resolvedByUid: string | null;
  resolvedAt: string | null;
  heldDepositHalalas: number;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface VerificationCheck {
  id: string;
  subjectUid: string;
  type: "email" | "phone_demo" | "identity_demo";
  method: string;
  status: "pending" | "verified" | "rejected";
  isSimulated: boolean;
  reviewerUid: string | null;
  checkedAt: string | null;
  reasonCode: string | null;
  createdAt: string;
}

export interface VerificationStatus {
  emailVerified: boolean;
  checks: VerificationCheck[];
  labels: VerificationLabel[];
}

export const ISSUE_LABELS: Record<DisputeIssue, string> = {
  damage: "Damage",
  missing_accessory: "Missing accessory",
  not_returned: "Not returned",
  late_return: "Late return",
  conduct: "Conduct",
  other: "Other",
};

export const OUTCOME_LABELS: Record<ItemOutcome, string> = {
  returned_ok: "Returned in good order",
  returned_damaged: "Returned damaged",
  lost: "Lost",
  needs_repair: "Needs repair",
};

export const CATEGORY_LABELS: Record<ReportCategory, string> = {
  unsafe: "Unsafe",
  misleading: "Misleading",
  inappropriate: "Inappropriate",
  harassment: "Harassment",
  fraud: "Fraud or scam",
  spam: "Spam",
  other: "Something else",
};

// ─── Roles ───

export const fetchMyRoles = () => apiFetch<Roles>("/me/roles");

// ─── Reviews and profiles ───

export const fetchMemberProfile = (uid: string) =>
  apiFetch<MemberProfile>(`/members/${encodeURIComponent(uid)}/profile`, { auth: false });

export const fetchMemberReviews = (uid: string) =>
  apiFetch<{ items: Review[]; hiddenByMember: boolean }>(`/members/${encodeURIComponent(uid)}/reviews`, {
    auth: false,
  });

export const memberPhotoUrl = (uid: string, variant: "main" | "thumbnail" = "thumbnail") =>
  `/api/members/${encodeURIComponent(uid)}/photo?variant=${variant}`;

export const createReview = (bookingId: string, body: { rating: number; comment: string }) =>
  apiFetch<Review>(`/me/bookings/${bookingId}/review`, { method: "POST", body });

// ─── Reports ───

export const createReport = (body: {
  targetType: ReportTargetType;
  targetId: string;
  bookingId?: string;
  category: ReportCategory;
  description: string;
  evidenceMediaIds: string[];
  clientRequestId: string;
}) => apiFetch<Report>("/me/reports", { method: "POST", body });

export const fetchMyReports = () => apiFetch<{ items: Report[] }>("/me/reports");

// ─── Disputes (participants) ───

export const openDispute = (
  bookingId: string,
  body: { expectedRevision: number; issue: DisputeIssue; description: string },
) => apiFetch<Dispute>(`/me/bookings/${bookingId}/dispute`, { method: "POST", body });

export const fetchDispute = (id: string) => apiFetch<Dispute>(`/me/disputes/${id}`);

export const addDisputeStatement = (id: string, text: string) =>
  apiFetch<Dispute>(`/me/disputes/${id}/statement`, { method: "POST", body: { text } });

// ─── Verification ───

export const fetchVerification = () => apiFetch<VerificationStatus>("/me/verification");
export const syncEmailVerification = () =>
  apiFetch<VerificationStatus>("/me/verification/email/sync", { method: "POST" });
export const requestDemoCheck = (type: "phone_demo" | "identity_demo") =>
  apiFetch<VerificationCheck>("/me/verification/demo-check", { method: "POST", body: { type } });

// ─── Reviewer workspace ───

export interface QueueItem {
  id: string;
  status: string;
  createdAt: string;
  assignedReviewerUid: string | null;
  assignedToMe: boolean;
  conflict: boolean;
  // disputes
  bookingId?: string;
  kind?: "exchange" | "complaint";
  issue?: DisputeIssue;
  itemTitle?: string;
  heldDepositHalalas?: number;
  // reports
  targetType?: ReportTargetType;
  category?: ReportCategory;
  // verification
  subjectUid?: string;
  subjectName?: string;
  type?: string;
}

export interface DisputeEvidence {
  dispute: Dispute;
  booking: import("@/features/bookings/bookings-types").Booking;
  owner: { uid: string; displayName: string };
  borrower: { uid: string; displayName: string };
  events: import("@/features/bookings/bookings-types").BookingEvent[];
  payments: import("@/features/bookings/bookings-types").Payment[];
  deposit: import("@/features/bookings/bookings-types").Deposit | null;
  conditionReports: import("@/features/bookings/bookings-types").ConditionReport[];
  linkedReports: { id: string; category: ReportCategory; description: string; status: string }[];
}

export interface ReportForReviewer {
  report: Report;
  reporterName: string;
  target: {
    targetType: ReportTargetType;
    title: string;
    involved: { uid: string; displayName: string }[];
    detail: Record<string, string | number | null>;
    messageBody: string | null;
  } | null;
}

export const fetchQueue = (type: "reports" | "disputes" | "verification") =>
  apiFetch<{ type: string; items: QueueItem[] }>(`/admin/queue?type=${type}`);

export const assignDispute = (id: string) => apiFetch<Dispute>(`/admin/disputes/${id}/assign`, { method: "POST" });
export const fetchDisputeEvidence = (id: string) => apiFetch<DisputeEvidence>(`/admin/disputes/${id}/evidence`);
export const resolveDispute = (
  id: string,
  body: {
    expectedRevision: number;
    rationale: string;
    itemOutcome: ItemOutcome;
    refundHalalas: number;
    compensationHalalas: number;
  },
) => apiFetch<Dispute>(`/admin/disputes/${id}/resolve`, { method: "POST", body });
export const disputePhotoPath = (id: string, mediaId: string, variant: "main" | "thumbnail") =>
  `/api/admin/disputes/${id}/media/${mediaId}?variant=${variant}`;

export const assignReport = (id: string) => apiFetch<Report>(`/admin/reports/${id}/assign`, { method: "POST" });
export const fetchReportForReviewer = (id: string) => apiFetch<ReportForReviewer>(`/admin/reports/${id}`);
export const closeReport = (
  id: string,
  body: {
    outcome: "no_action" | "content_hidden" | "member_warned" | "escalated_to_dispute" | "other";
    note: string;
  },
) => apiFetch<Report>(`/admin/reports/${id}/close`, { method: "POST", body });
export const reportPhotoPath = (id: string, mediaId: string, variant: "main" | "thumbnail") =>
  `/api/admin/reports/${id}/media/${mediaId}?variant=${variant}`;

export const hideReview = (id: string, reason: string) =>
  apiFetch<Review>(`/admin/reviews/${encodeURIComponent(id)}/hide`, { method: "POST", body: { reason } });

export const decideVerification = (id: string, body: { decision: "verified" | "rejected"; reasonCode: string }) =>
  apiFetch<VerificationCheck>(`/admin/verification/${id}/decide`, { method: "POST", body });
