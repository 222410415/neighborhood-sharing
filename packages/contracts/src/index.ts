/**
 * @neighborhood/contracts
 *
 * Shared Zod schemas, DTOs, and type definitions used by both the
 * NestJS backend and the Next.js frontend.
 */

// Common
export * from "./common/limits";
export * from "./common/error-contracts";

// Reference data
export * from "./reference/reference-contracts";

// Profile
export * from "./profile/profile-contracts";

// Listing
export * from "./listing/listing-contracts";

// Media
export * from "./media/media-contracts";

// Sprint 2: exchange workflow
export * from "./booking/booking-config";
export * from "./booking/booking-rules";
export * from "./booking/booking-contracts";
export * from "./availability/availability-contracts";
export * from "./quote/quote-contracts";
export * from "./payment/payment-contracts";
export * from "./condition/condition-contracts";
export * from "./conversation/conversation-contracts";
export * from "./notification/notification-contracts";

// Sprint 3: trust, community and AI
export * from "./trust/trust-config";
export * from "./trust/trust-contracts";
export * from "./community/community-contracts";
export * from "./ai/ai-contracts";
