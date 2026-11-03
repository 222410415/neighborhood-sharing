import { z } from "zod";
import { idSchema, timestampSchema } from "../common/limits";
import { TRUST_CONFIG } from "../trust/trust-config";

/**
 * AI-assisted features (Sprint 3): related-item suggestions and the policy
 * assistant. Both have a deterministic fallback and never act on bookings,
 * money, verification or disputes.
 */

// ─── Suggestions ───

export const suggestionsQuerySchema = z.object({
  from: timestampSchema.optional(),
  to: timestampSchema.optional(),
});

export interface SuggestionItemDto {
  id: string;
  titleEn: string;
  categoryId: string;
  categoryName: string;
  neighborhoodName: string;
  lendingMode: "free" | "paid";
  dailyRateHalalas: number;
  depositHalalas: number;
  primaryMediaId: string | null;
  /** Short reason; present for AI-assisted suggestions only. */
  reason: string | null;
}

export interface SuggestionsDto {
  listingId: string;
  /** "ai" when the AI model ranked the candidates; "category" for the ordinary fallback. */
  source: "ai" | "category";
  label: string;
  items: SuggestionItemDto[];
  generatedAt: string;
}

/** Structured output the model must return (validated by the API). */
export const aiSuggestionOutputSchema = z.object({
  suggestions: z
    .array(
      z.object({
        id: z.string().min(1).max(128),
        reason: z.string().max(400).default(""),
      }),
    )
    .max(20),
});

// ─── Policies ───

export const policyStatusSchema = z.enum(["draft", "published", "retired"]);

export interface PolicySummaryDto {
  id: string;
  policyKey: string;
  version: string;
  titleEn: string;
  titleAr: string;
  status: z.infer<typeof policyStatusSchema>;
  isDemoDraft: boolean;
  approvedAt: string | null;
  effectiveAt: string | null;
}

export interface PolicyDto extends PolicySummaryDto {
  bodyEn: string;
  bodyAr: string;
}

export const askPolicyBodySchema = z.object({
  question: z.string().trim().min(3, "Ask a question").max(TRUST_CONFIG.maxQuestionLength),
  locale: z.enum(["en-SA", "ar-SA"]).optional(),
  bookingId: idSchema.optional(),
});

export type AskPolicyBody = z.infer<typeof askPolicyBodySchema>;

export interface PolicySourceDto {
  policyVersionId: string;
  policyKey: string;
  version: string;
  title: string;
  isDemoDraft: boolean;
  excerpt: string;
}

export interface PolicyAnswerDto {
  answer: string;
  canAnswer: boolean;
  /** "ai": generated from the passages; "extractive": the matching policy text; "none": no passage applies. */
  generated: "ai" | "extractive" | "none";
  sources: PolicySourceDto[];
  draftNotice: string | null;
  bookingContext: { bookingId: string; note: string } | null;
  locale: "en-SA" | "ar-SA";
}

/** Structured output the model must return (validated by the API). */
export const aiPolicyOutputSchema = z.object({
  canAnswer: z.boolean(),
  answer: z.string().max(3000),
  citedPolicyIds: z.array(z.string().max(128)).max(10),
});

export const DRAFT_POLICY_NOTICE_EN =
  "These policies are demonstration drafts awaiting team approval. They are not real platform rules.";
export const DRAFT_POLICY_NOTICE_AR =
  "هذه السياسات مسودات تجريبية بانتظار اعتماد الفريق، وليست قواعد فعلية للمنصة.";
