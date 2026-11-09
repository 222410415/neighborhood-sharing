/**
 * POST /v1/internal/sweep — optional bulk expiry/overdue evaluation and
 * pickup/return reminders.
 *
 * Free hosting has no reliable scheduler, so every read and command already
 * applies due transitions lazily. This endpoint lets an external pinger do the
 * same in bulk. It is disabled (404) unless SWEEP_SECRET is set, and requires
 * the header `x-sweep-secret` to match.
 */

import { Controller, Headers, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { timingSafeEqual } from "node:crypto";
import { NotFoundException, UnauthorizedException } from "../../common/errors/api-exceptions.js";
import { BookingService } from "./booking.service.js";
import { ReminderService } from "../notifications/reminder.service.js";

function secretsMatch(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

@Controller("internal")
export class SweepController {
  constructor(
    private readonly bookings: BookingService,
    private readonly reminders: ReminderService,
  ) {}

  @Post("sweep")
  @HttpCode(HttpStatus.OK)
  async sweep(@Headers("x-sweep-secret") secret?: string) {
    const expected = process.env["SWEEP_SECRET"];
    if (!expected) throw new NotFoundException("Not found");
    if (!secret || !secretsMatch(secret, expected)) {
      throw new UnauthorizedException("Invalid sweep secret");
    }
    const result = await this.bookings.sweep();
    return { ...result, remindersCreated: await this.reminders.sweep() };
  }
}
