/**
 * Owner calendar controller.
 *
 * PATCH  /v1/me/listings/:id/booking-settings  — booking mode and bookable window
 * GET    /v1/me/listings/:id/blocks            — owner blocks (with notes) and reservations
 * POST   /v1/me/listings/:id/blocks            — add an unavailable period
 * DELETE /v1/me/listings/:id/blocks/:blockId   — remove an unavailable period
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  bookingSettingsBodySchema,
  ownerBlockBodySchema,
  type BookingSettingsBody,
  type OwnerBlockBody,
} from "@neighborhood/contracts";
import { AuthGuard, type VerifiedUser } from "../../common/guards/auth.guard.js";
import { CurrentUser } from "../../common/guards/current-user.decorator.js";
import { ZodValidationInterceptor } from "../../common/validation/zod-validation.interceptor.js";
import { AvailabilityService } from "./availability.service.js";

@Controller("me/listings")
@UseGuards(AuthGuard)
export class OwnerCalendarController {
  constructor(private readonly availability: AvailabilityService) {}

  @Patch(":id/booking-settings")
  @UseInterceptors(new ZodValidationInterceptor(bookingSettingsBodySchema))
  async updateBookingSettings(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Body() body: BookingSettingsBody,
  ) {
    return this.availability.updateBookingSettings(id, user.uid, body);
  }

  @Get(":id/blocks")
  async getCalendar(@CurrentUser() user: VerifiedUser, @Param("id") id: string) {
    return this.availability.getOwnerCalendar(id, user.uid);
  }

  @Post(":id/blocks")
  @UseInterceptors(new ZodValidationInterceptor(ownerBlockBodySchema))
  @HttpCode(HttpStatus.CREATED)
  async addBlock(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Body() body: OwnerBlockBody,
  ) {
    return this.availability.addOwnerBlock(id, user.uid, body);
  }

  @Delete(":id/blocks/:blockId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeBlock(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Param("blockId") blockId: string,
  ) {
    await this.availability.removeOwnerBlock(id, user.uid, blockId);
  }
}
