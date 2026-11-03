/**
 * Public listing controller — unauthenticated endpoints for catalogue and details.
 *
 * GET /v1/listings        — published listings with filters, search, pagination
 * GET /v1/listings/:id   — published listing detail with safe owner summary
 *                          (an optional bearer token only sets `isOwner`)
 */

import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { PublicListingService } from "./public-listing.service.js";
import { OptionalAuthGuard } from "../../common/guards/optional-auth.guard.js";
import { CurrentUser } from "../../common/guards/current-user.decorator.js";
import type { VerifiedUser } from "../../common/guards/auth.guard.js";
import { NotFoundException, ValidationException } from "../../common/errors/api-exceptions.js";
import { parseOrThrow } from "../../common/validation/parse.js";
import { catalogueQuerySchema } from "@neighborhood/contracts";

@Controller("listings")
export class PublicListingController {
  constructor(private readonly service: PublicListingService) {}

  /** Filters: category, neighborhood, lendingMode, search, from/to (dates), minRate/maxRate (halalas). */
  @Get()
  async listListings(@Query() query: Record<string, unknown>) {
    const q = parseOrThrow(catalogueQuerySchema, query);
    if ((q.from && !q.to) || (!q.from && q.to)) {
      throw new ValidationException([{ field: "to", message: "Give both 'from' and 'to', or neither" }]);
    }
    return this.service.listPublished(q);
  }

  @Get(":id")
  @UseGuards(OptionalAuthGuard)
  async getListing(
    @Param("id") id: string,
    @CurrentUser() user?: VerifiedUser,
  ) {
    const detail = await this.service.getPublishedDetail(id, user?.uid);
    if (!detail) {
      throw new NotFoundException("Listing not found");
    }
    return detail;
  }
}
