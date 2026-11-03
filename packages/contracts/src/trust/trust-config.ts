/**
 * Sprint 3 configuration.
 *
 * DRAFT VALUES PENDING TEAM APPROVAL (plan gate G3). They are development
 * defaults, not researched policy.
 */

export const TRUST_CONFIG = {
  /** Reviews and post-completion complaints are allowed this long after completion. */
  reviewWindowDays: 14,
  maxReviewCommentLength: 500,
  maxReportDescriptionLength: 1000,
  maxEvidencePhotos: 3,
  maxDisputeStatements: 20,
  maxStatementLength: 1000,
  maxRationaleLength: 2000,
  /** A community request can be open for at most this many at once per member. */
  maxOpenRequestsPerMember: 10,
  maxRequestTitleLength: 120,
  maxRequestDescriptionLength: 1000,
  maxOfferMessageLength: 500,
  /** AI suggestions: candidates sent to the model and suggestions shown. */
  maxSuggestionCandidates: 20,
  maxSuggestions: 4,
  suggestionCacheSeconds: 600,
  /** Policy assistant: passages retrieved per question and question length. */
  maxPolicyPassages: 5,
  maxQuestionLength: 500,
  /** Catalogue scan budget per request (documents read before reporting continuation). */
  catalogueScanBudget: 240,
} as const;
