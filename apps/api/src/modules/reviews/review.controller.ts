/**
 * Reviews and public profiles.
 *
 * POST /v1/me/bookings/:id/review     — participant of a completed booking, once
 * GET  /v1/members/:uid/profile       — public safe projection with reputation
 * GET  /v1/members/:uid/reviews       — public, visible reviews only
 * GET  /v1/members/:uid/photo?variant — public profile photo, if set
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
  Res,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { Response } from "express";
import { createReviewBodySchema, type CreateReviewBody } from "@neighborhood/contracts";
import { AuthGuard, type VerifiedUser } from "../../common/guards/auth.guard.js";
import { CurrentUser } from "../../common/guards/current-user.decorator.js";
import { ZodValidationInterceptor } from "../../common/validation/zod-validation.interceptor.js";
import { ReviewService } from "./review.service.js";
import { MemberProfileService } from "./member-profile.service.js";

@Controller()
export class ReviewController {
  constructor(
    private readonly reviews: ReviewService,
    private readonly profiles: MemberProfileService,
  ) {}

  @Post("me/bookings/:id/review")
  @UseGuards(AuthGuard)
  @UseInterceptors(new ZodValidationInterceptor(createReviewBodySchema))
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: VerifiedUser, @Param("id") id: string, @Body() body: CreateReviewBody) {
    return this.reviews.create(user.uid, id, body);
  }

  @Get("members/:uid/profile")
  async profile(@Param("uid") uid: string) {
    return this.profiles.profile(uid);
  }

  @Get("members/:uid/reviews")
  async reviewsOf(@Param("uid") uid: string) {
    return this.profiles.reviewsOf(uid);
  }

  @Get("members/:uid/photo")
  async photo(@Param("uid") uid: string, @Query("variant") variant: string, @Res() res: Response) {
    const photo = await this.profiles.photo(uid, variant === "main" ? "main" : "thumbnail");
    res.setHeader("Content-Type", photo.mimeType);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(photo.bytes);
  }
}
