import { z } from "zod";
import { timestampSchema } from "../common/limits";
import type { BookingMode } from "../booking/booking-contracts";
import type { DateProblem } from "../booking/booking-rules";

/**
 * Quote contracts. The quote is always calculated on the server from the
 * current listing; the browser never supplies amounts.
 */

export const quoteBodySchema = z.object({
  startAt: timestampSchema,
  endAt: timestampSchema,
});

export type QuoteBody = z.infer<typeof quoteBodySchema>;

export type QuoteProblem =
  | DateProblem
  | "conflict"
  | "item_on_hold"
  | "own_item"
  | "not_published";

/**
 * How the booking becomes confirmed:
 * - owner_approval: owner accepts, then the borrower confirms with a simulated payment
 * - instant: dates are held at once, then the borrower confirms with a simulated payment
 * - instant_no_payment: free item without deposit, confirmed at once
 */
export type ConfirmationMethod = "owner_approval" | "instant" | "instant_no_payment";

export interface QuoteDto {
  listingId: string;
  startAt: string;
  endAt: string;
  currency: "SAR";
  lendingMode: "free" | "paid";
  bookingMode: BookingMode;
  dailyRateHalalas: number;
  billableDays: number;
  rentalFeeHalalas: number;
  depositHalalas: number;
  totalHalalas: number;
  available: boolean;
  problem: QuoteProblem | null;
  message: string | null;
  confirmation: ConfirmationMethod;
  paymentMode: "simulated";
  /** Opaque value the request must carry; changes when the listing or dates change. */
  quoteFingerprint: string;
}
