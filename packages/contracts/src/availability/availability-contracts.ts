import { z } from "zod";
import { timestampSchema } from "../common/limits";
import { BOOKING_CONFIG, DAY_MS } from "../booking/booking-config";
import { bookingModeSchema, clientRequestIdSchema, type BookingMode } from "../booking/booking-contracts";
import type { Interval } from "../booking/booking-rules";

/**
 * Availability contracts: owner booking settings, owner unavailable periods
 * and the public availability view (busy intervals only, never reasons).
 */

export const bookingSettingsBodySchema = z
  .object({
    bookingMode: bookingModeSchema,
    bookableFrom: timestampSchema.nullable(),
    bookableUntil: timestampSchema.nullable(),
    expectedRevision: z.number().int().nonnegative(),
  })
  .superRefine((v, ctx) => {
    if ((v.bookableFrom === null) !== (v.bookableUntil === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["bookableUntil"],
        message: "Set both the first and last bookable dates, or neither",
      });
      return;
    }
    if (v.bookableFrom && v.bookableUntil) {
      const from = Date.parse(v.bookableFrom);
      const until = Date.parse(v.bookableUntil);
      if (until <= from) {
        ctx.addIssue({
          code: "custom",
          path: ["bookableUntil"],
          message: "The last bookable date must be after the first",
        });
      } else if (until - from > 366 * DAY_MS) {
        ctx.addIssue({
          code: "custom",
          path: ["bookableUntil"],
          message: "The bookable window can be at most one year",
        });
      }
    }
  });

export const ownerBlockBodySchema = z
  .object({
    startAt: timestampSchema,
    endAt: timestampSchema,
    note: z.string().trim().max(200).optional(),
    clientRequestId: clientRequestIdSchema.optional(),
  })
  .superRefine((v, ctx) => {
    const start = Date.parse(v.startAt);
    const end = Date.parse(v.endAt);
    if (end <= start) {
      ctx.addIssue({ code: "custom", path: ["endAt"], message: "End must be after start" });
    } else if (end - start > BOOKING_CONFIG.maxOwnerBlockDays * DAY_MS) {
      ctx.addIssue({
        code: "custom",
        path: ["endAt"],
        message: `An unavailable period can be at most ${BOOKING_CONFIG.maxOwnerBlockDays} days`,
      });
    }
  });

export const availabilityQuerySchema = z.object({
  from: timestampSchema.optional(),
  to: timestampSchema.optional(),
});

export type BookingSettingsBody = z.infer<typeof bookingSettingsBodySchema>;
export type OwnerBlockBody = z.infer<typeof ownerBlockBodySchema>;

/** Public view: busy intervals and the bookable window, nothing else. */
export interface AvailabilityDto {
  listingId: string;
  setUp: boolean;
  bookingMode: BookingMode;
  bookableFrom: string | null;
  bookableUntil: string | null;
  minimumBillableDays: number;
  maximumBillableDays: number;
  maxHorizonDays: number;
  /** False while the item is held by an overdue, return-pending or disputed exchange. */
  acceptingRequests: boolean;
  from: string;
  to: string;
  busy: Interval[];
}

/** Owner view of a calendar block. Reservation blocks are read-only. */
export interface OwnerBlockDto {
  id: string;
  kind: "owner" | "reservation";
  startAt: string;
  endAt: string;
  status: "live" | "released";
  note?: string;
  bookingId?: string;
  holdExpiresAt?: string | null;
  createdAt: string;
}

export interface OwnerCalendarDto {
  listingId: string;
  bookingMode: BookingMode;
  bookableFrom: string | null;
  bookableUntil: string | null;
  revision: number;
  itemOnHold: boolean;
  ownerBlocks: OwnerBlockDto[];
  reservations: OwnerBlockDto[];
}
