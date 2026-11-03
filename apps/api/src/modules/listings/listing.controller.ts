/**
 * Listing controller — owner-side endpoints for listing management.
 *
 * GET    /v1/me/listings           — owner inventory (with optional status filter)
 * GET    /v1/me/listings/:id       — owner edit record (private)
 * POST   /v1/me/listings           — create draft
 * PATCH  /v1/me/listings/:id      — edit content (allowlisted fields)
 * POST   /v1/me/listings/:id/publish
 * POST   /v1/me/listings/:id/pause
 * POST   /v1/me/listings/:id/archive
 * POST   /v1/me/listings/:id/media — attach media
 * DELETE /v1/me/listings/:id/media/:mediaId — detach media
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { AuthGuard, type VerifiedUser } from "../../common/guards/auth.guard.js";
import { CurrentUser } from "../../common/guards/current-user.decorator.js";
import { ZodValidationInterceptor } from "../../common/validation/zod-validation.interceptor.js";
import { ListingService } from "./listing.service.js";
import {
  createListingBodySchema,
  updateListingBodySchema,
  type CreateListingBody,
  type UpdateListingBody,
} from "@neighborhood/contracts";

@Controller("me/listings")
@UseGuards(AuthGuard)
export class ListingController {
  constructor(private readonly listingService: ListingService) {}

  @Get()
  async getMyListings(
    @CurrentUser() user: VerifiedUser,
    @Query("status") status?: string,
  ) {
    const listings = await this.listingService.getOwnerListings(user.uid, status);
    return { items: listings };
  }

  @Get(":id")
  async getMyListing(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
  ) {
    return this.listingService.getOwnerListing(id, user.uid);
  }

  @Post()
  @UseInterceptors(new ZodValidationInterceptor(createListingBodySchema))
  @HttpCode(HttpStatus.CREATED)
  async createListing(
    @CurrentUser() user: VerifiedUser,
    @Body() body: CreateListingBody,
  ) {
    return this.listingService.createDraft(user.uid, body);
  }

  @Patch(":id")
  @UseInterceptors(new ZodValidationInterceptor(updateListingBodySchema))
  async updateListing(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Body() body: UpdateListingBody,
  ) {
    return this.listingService.updateListing(id, user.uid, body);
  }

  @Post(":id/publish")
  async publishListing(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Body() body: { expectedRevision: number },
  ) {
    return this.listingService.publishListing(id, user.uid, body.expectedRevision);
  }

  @Post(":id/pause")
  async pauseListing(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Body() body: { expectedRevision: number },
  ) {
    return this.listingService.pauseListing(id, user.uid, body.expectedRevision);
  }

  @Post(":id/archive")
  async archiveListing(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Body() body: { expectedRevision: number },
  ) {
    return this.listingService.archiveListing(id, user.uid, body.expectedRevision);
  }

  @Post(":id/media")
  async attachMedia(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Body() body: { mediaIds: string[] },
  ) {
    return this.listingService.attachMedia(id, user.uid, body.mediaIds);
  }

  @Delete(":id/media/:mediaId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async detachMedia(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Param("mediaId") mediaId: string,
  ) {
    await this.listingService.detachMedia(id, user.uid, mediaId);
  }
}
