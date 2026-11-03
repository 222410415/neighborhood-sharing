/**
 * Favorites and community requests.
 *
 * GET    /v1/me/favorites                 PUT/DELETE /v1/me/favorites/:listingId
 * GET    /v1/requests                     (public, open requests)
 * GET    /v1/requests/:id                 (public, with current offers)
 * GET    /v1/me/requests                  POST /v1/me/requests
 * PATCH  /v1/me/requests/:id              POST /v1/me/requests/:id/close
 * POST   /v1/me/requests/:id/offers
 * POST   /v1/me/requests/:id/offers/:offerId/{select,withdraw}
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
  Put,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import {
  createOfferBodySchema,
  createRequestBodySchema,
  saveFavoriteBodySchema,
  updateRequestBodySchema,
  type CreateOfferBody,
  type CreateRequestBody,
  type SaveFavoriteBody,
  type UpdateRequestBody,
} from "@neighborhood/contracts";
import { AuthGuard, type VerifiedUser } from "../../common/guards/auth.guard.js";
import { CurrentUser } from "../../common/guards/current-user.decorator.js";
import { ZodValidationInterceptor } from "../../common/validation/zod-validation.interceptor.js";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit/rate-limit.guard.js";
import { FavoriteService } from "./favorite.service.js";
import { RequestService } from "./request.service.js";

@Controller()
export class CommunityController {
  constructor(
    private readonly favorites: FavoriteService,
    private readonly requests: RequestService,
  ) {}

  // ─── Favorites ───

  @Get("me/favorites")
  @UseGuards(AuthGuard)
  async myFavorites(@CurrentUser() user: VerifiedUser) {
    return { items: await this.favorites.list(user.uid) };
  }

  @Put("me/favorites/:listingId")
  @UseGuards(AuthGuard)
  @UseInterceptors(new ZodValidationInterceptor(saveFavoriteBodySchema))
  async save(@CurrentUser() user: VerifiedUser, @Param("listingId") listingId: string, @Body() body: SaveFavoriteBody) {
    return this.favorites.save(user.uid, listingId, body);
  }

  @Delete("me/favorites/:listingId")
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() user: VerifiedUser, @Param("listingId") listingId: string) {
    await this.favorites.remove(user.uid, listingId);
  }

  // ─── Requests (public) ───

  @Get("requests")
  async openRequests() {
    return { items: await this.requests.listOpen() };
  }

  @Get("requests/:id")
  async request(@Param("id") id: string) {
    return this.requests.get(id);
  }

  // ─── Requests (members) ───

  @Get("me/requests")
  @UseGuards(AuthGuard)
  async mine(@CurrentUser() user: VerifiedUser) {
    return { items: await this.requests.listMine(user.uid) };
  }

  @Post("me/requests")
  @UseGuards(AuthGuard, RateLimitGuard)
  @RateLimit("requests")
  @UseInterceptors(new ZodValidationInterceptor(createRequestBodySchema))
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: VerifiedUser, @Body() body: CreateRequestBody) {
    return this.requests.create(user.uid, body);
  }

  @Patch("me/requests/:id")
  @UseGuards(AuthGuard)
  @UseInterceptors(new ZodValidationInterceptor(updateRequestBodySchema))
  async update(@CurrentUser() user: VerifiedUser, @Param("id") id: string, @Body() body: UpdateRequestBody) {
    return this.requests.update(user.uid, id, body);
  }

  @Post("me/requests/:id/close")
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async close(@CurrentUser() user: VerifiedUser, @Param("id") id: string) {
    return this.requests.close(user.uid, id);
  }

  @Post("me/requests/:id/offers")
  @UseGuards(AuthGuard, RateLimitGuard)
  @RateLimit("offers")
  @UseInterceptors(new ZodValidationInterceptor(createOfferBodySchema))
  @HttpCode(HttpStatus.CREATED)
  async offer(@CurrentUser() user: VerifiedUser, @Param("id") id: string, @Body() body: CreateOfferBody) {
    return this.requests.offer(user.uid, id, body);
  }

  @Post("me/requests/:id/offers/:offerId/select")
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async select(@CurrentUser() user: VerifiedUser, @Param("id") id: string, @Param("offerId") offerId: string) {
    return this.requests.select(user.uid, id, offerId);
  }

  @Post("me/requests/:id/offers/:offerId/withdraw")
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.OK)
  async withdraw(@CurrentUser() user: VerifiedUser, @Param("id") id: string, @Param("offerId") offerId: string) {
    return this.requests.withdraw(user.uid, id, offerId);
  }
}
