import { z } from "zod";

/**
 * Simulated payment and deposit records.
 *
 * Every record carries mode "simulated". No bank details are collected and no
 * real money moves. Payments are append-only operation records; deposits hold
 * balances with the invariant captured = held + refunded + compensation.
 */

export const paymentComponentSchema = z.enum(["rental", "deposit"]);
/** compensation: part of a held deposit allocated to the owner by dispute resolution (simulated). */
export const paymentOperationSchema = z.enum(["collect", "refund", "compensation"]);
export const paymentStatusSchema = z.enum(["succeeded"]);
export const paymentModeSchema = z.enum(["simulated"]);
export const depositStatusSchema = z.enum(["pending", "held", "under_review", "settled"]);

export type PaymentComponent = z.infer<typeof paymentComponentSchema>;
export type PaymentOperation = z.infer<typeof paymentOperationSchema>;
export type DepositStatus = z.infer<typeof depositStatusSchema>;

export interface PaymentDto {
  id: string;
  bookingId: string;
  component: PaymentComponent;
  operation: PaymentOperation;
  amountHalalas: number;
  currency: "SAR";
  status: "succeeded";
  mode: "simulated";
  idempotencyKey: string;
  createdAt: string;
}

export interface DepositDto {
  bookingId: string;
  requiredHalalas: number;
  capturedHalalas: number;
  heldHalalas: number;
  refundedHalalas: number;
  /** Set only by dispute resolution (simulated allocation to the owner). */
  compensationHalalas: number;
  status: DepositStatus;
  mode: "simulated";
  revision: number;
  createdAt: string;
  updatedAt: string;
}
