/**
 * Media controller — HTTP endpoints for image upload, read, and delete.
 *
 * POST   /v1/me/media        — upload (multipart, authenticated)
 * GET    /v1/me/media/:id     — owner read (private, authenticated)
 * DELETE /v1/me/media/:id     — delete unattached (authenticated, owner only)
 * GET    /v1/media/:id        — public read (checks parent listing published)
 */

import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
  Req,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response, Request } from "express";
import { AuthGuard, type VerifiedUser } from "../../common/guards/auth.guard.js";
import { CurrentUser } from "../../common/guards/current-user.decorator.js";
import { MediaService } from "./media.service.js";
import { IMAGE_LIMITS } from "./image-config.js";
import {
  NotFoundException,
  BadRequestException,
} from "../../common/errors/api-exceptions.js";

@Controller()
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post("me/media")
  @UseGuards(AuthGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: IMAGE_LIMITS.MAX_INPUT_BYTES,
      },
    }),
  )
  @HttpCode(HttpStatus.CREATED)
  async uploadMedia(
    @CurrentUser() user: VerifiedUser,
    @Req() req: Request,
  ) {
    const file = (req as any).file;

    if (!file) {
      throw new BadRequestException("No file provided. Use field name 'file'.");
    }

    const clientSubmissionId = req.headers["x-client-submission-id"] as string | undefined;

    // Optional multipart field (or query) "purpose": listing (default), condition, profile or report.
    const rawPurpose = (req.body as Record<string, unknown> | undefined)?.["purpose"] ?? req.query["purpose"];
    const purposes = ["listing", "condition", "profile", "report"] as const;
    if (rawPurpose !== undefined && !purposes.includes(rawPurpose as (typeof purposes)[number])) {
      throw new BadRequestException("purpose must be listing, condition, profile or report");
    }
    const purpose = (rawPurpose ?? "listing") as (typeof purposes)[number];

    const result = await this.mediaService.upload(
      user.uid,
      file.buffer as Buffer,
      clientSubmissionId,
      purpose,
    );

    return {
      mediaId: result.mediaId,
      ownerUid: result.meta.ownerUid,
      listingId: result.meta.listingId,
      uploadState: result.meta.uploadState,
      mimeType: result.meta.mimeType,
      widthPx: result.meta.widthPx,
      heightPx: result.meta.heightPx,
      thumbnailWidthPx: result.meta.thumbnailWidthPx,
      thumbnailHeightPx: result.meta.thumbnailHeightPx,
      originalWidthPx: result.meta.originalWidthPx,
      originalHeightPx: result.meta.originalHeightPx,
      mainSizeBytes: result.meta.mainSizeBytes,
      thumbnailSizeBytes: result.meta.thumbnailSizeBytes,
      checksum: result.meta.checksum,
      createdAt: result.meta.createdAt,
      expiresAt: result.meta.expiresAt,
      purpose: result.meta.purpose ?? "listing",
    };
  }

  @Get("me/media/:id")
  @UseGuards(AuthGuard)
  async getOwnerMedia(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Query("variant") variant: string,
    @Res() res: Response,
  ) {
    const v = variant === "thumbnail" ? "thumbnail" : "main";
    const result = await this.mediaService.getOwnerMedia(id, user.uid, v);

    if (!result) {
      throw new NotFoundException("Media not found");
    }

    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(result.bytes);
  }

  @Delete("me/media/:id")
  @UseGuards(AuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMedia(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
  ) {
    await this.mediaService.deleteUpload(id, user.uid);
  }

  @Get("media/:id")
  async getPublicMedia(
    @Param("id") id: string,
    @Query("variant") variant: string,
    @Res() res: Response,
  ) {
    const v = variant === "thumbnail" ? "thumbnail" : "main";
    const result = await this.mediaService.getPublicMedia(id, v);

    if (!result) {
      throw new NotFoundException("Media not found");
    }

    res.setHeader("Content-Type", result.mimeType);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(result.bytes);
  }
}
