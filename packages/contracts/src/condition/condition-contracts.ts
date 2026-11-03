import { z } from "zod";
import { idSchema } from "../common/limits";
import { BOOKING_CONFIG } from "../booking/booking-config";
import { clientRequestIdSchema, expectedRevisionSchema } from "../booking/booking-contracts";

/**
 * Condition records for collection and return. Submitted content is
 * immutable; the other participant records agreement or disagreement.
 */

export const conditionStageSchema = z.enum(["collection", "return"]);
export const overallConditionSchema = z.enum(["new", "excellent", "good", "fair", "damaged"]);

export const checklistItemSchema = z.object({
  label: z.string().trim().min(1).max(80),
  ok: z.boolean(),
  note: z.string().trim().max(200).optional(),
});

export const conditionReportBodySchema = z.object({
  overallCondition: overallConditionSchema,
  checklist: z.array(checklistItemSchema).max(BOOKING_CONFIG.maxChecklistItems),
  notes: z.string().trim().max(BOOKING_CONFIG.maxNoteLength).default(""),
  mediaIds: z
    .array(idSchema)
    .max(BOOKING_CONFIG.maxConditionPhotos)
    .refine((ids) => new Set(ids).size === ids.length, "Photos must not repeat")
    .default([]),
  clientRequestId: clientRequestIdSchema,
});

export const conditionAcknowledgeBodySchema = z
  .object({
    decision: z.enum(["agreed", "disagreed"]),
    note: z.string().trim().max(500).optional(),
    expectedRevision: expectedRevisionSchema,
  })
  .superRefine((v, ctx) => {
    if (v.decision === "disagreed" && !v.note) {
      ctx.addIssue({
        code: "custom",
        path: ["note"],
        message: "Explain what does not match the record",
      });
    }
  });

export type ConditionStage = z.infer<typeof conditionStageSchema>;
export type OverallCondition = z.infer<typeof overallConditionSchema>;
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type ConditionReportBody = z.infer<typeof conditionReportBodySchema>;
export type ConditionAcknowledgeBody = z.infer<typeof conditionAcknowledgeBodySchema>;

export interface ConditionAcknowledgementDto {
  decision: "agreed" | "disagreed";
  byUid: string;
  note?: string;
  at: string;
}

export interface ConditionReportDto {
  id: string;
  bookingId: string;
  stage: ConditionStage;
  /** 1 for the first record; corrections add a new version and keep the earlier ones readable. */
  version: number;
  supersedesId: string | null;
  submittedByUid: string;
  overallCondition: OverallCondition;
  checklist: ChecklistItem[];
  notes: string;
  mediaIds: string[];
  status: "submitted";
  submittedAt: string;
  acknowledgement: ConditionAcknowledgementDto | null;
}
