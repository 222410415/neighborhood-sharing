/**
 * Public availability and quote routes (no sign-in needed).
 *
 * GET  /v1/listings/:id/availability?from&to — busy intervals and bookable window
 * POST /v1/listings/:id/quote                — server-calculated quote
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  availabilityQuerySchema,
  quoteBodySchema,
  type QuoteBody,
} from "@neighborhood/contracts";
import type { VerifiedUser } from "../../common/guards/auth.guard.js";
import { OptionalAuthGuard } from "../../common/guards/optional-auth.guard.js";
import { CurrentUser } from "../../common/guards/current-user.decorator.js";
import { ZodValidationInterceptor } from "../../common/validation/zod-validation.interceptor.js";
import { parseOrThrow } from "../../common/validation/parse.js";
import { AvailabilityService } from "./availability.service.js";
import { QuoteService } from "./quote.service.js";

@Controller("listings")
export class PublicAvailabilityController {
  constructor(
    private readonly availability: AvailabilityService,
    private readonly quotes: QuoteService,
  ) {}

  @Get(":id/availability")
  async getAvailability(@Param("id") id: string, @Query() query: Record<string, unknown>) {
    const range = parseOrThrow(availabilityQuerySchema, query);
    return this.availability.getPublicAvailability(id, range);
  }

  @Post(":id/quote")
  @UseGuards(OptionalAuthGuard)
  @UseInterceptors(new ZodValidationInterceptor(quoteBodySchema))
  @HttpCode(HttpStatus.OK)
  async quote(
    @Param("id") id: string,
    @Body() body: QuoteBody,
    @CurrentUser() user?: VerifiedUser,
  ) {
    return this.quotes.quoteForListing(id, body, user?.uid);
  }
}
