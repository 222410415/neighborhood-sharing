/**
 * Admin workspace. Every route requires the admin role (D-43),
 * checked on the server by RolesGuard; every write and every evidence read is
 * audited by the services.
 *
 * GET  /v1/admin/queue?type=reports|disputes|verification
 * GET  /v1/admin/reports/:id                 POST /v1/admin/reports/:id/{assign,close,decide}
 * GET  /v1/admin/reports/:id/media/:mediaId
 * GET  /v1/admin/disputes/:id/evidence       POST /v1/admin/disputes/:id/{assign,resolve}
 * GET  /v1/admin/disputes/:id/media/:mediaId
 * POST /v1/admin/reviews/:id/hide
 * POST /v1/admin/verification/:id/decide
 * POST /v1/admin/policies/:id/publish
 * GET  /v1/admin/moderation                  suspended members, removed listings
 * POST /v1/admin/listings/:id/restore
 * POST /v1/admin/members/:uid/reinstate
 * GET  /v1/admin/audit?entityType&entityId
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
import { z } from "zod";
import {
  closeReportBodySchema,
  decideReportBodySchema,
  decideVerificationBodySchema,
  moderationReasonBodySchema,
  hideReviewBodySchema,
  resolveDisputeBodySchema,
  type CloseReportBody,
  type DecideReportBody,
  type DecideVerificationBody,
  type ModerationReasonBody,
  type HideReviewBody,
  type ResolveDisputeBody,
} from "@neighborhood/contracts";
import { AuthGuard, type VerifiedUser } from "../../common/guards/auth.guard.js";
import { CurrentUser } from "../../common/guards/current-user.decorator.js";
import { RequestId } from "../../common/request-id/request-id.decorator.js";
import { ZodValidationInterceptor } from "../../common/validation/zod-validation.interceptor.js";
import { parseOrThrow } from "../../common/validation/parse.js";
import { NotFoundException } from "../../common/errors/api-exceptions.js";
import { decodeImageBytes } from "../media/base64-helpers.js";
import type { MediaDocument } from "../media/media.repository.js";
import { RequireRoles, RolesGuard } from "../roles/roles.guard.js";
import { AuditService } from "../roles/audit.service.js";
import { ReportService } from "../trust/report.service.js";
import { DisputeService } from "../trust/dispute.service.js";
import { ModerationService } from "../trust/moderation.service.js";
import { ReviewService } from "../reviews/review.service.js";
import { VerificationService } from "../verification/verification.service.js";
import { PolicyService } from "../policies/policy.service.js";

const queueQuerySchema = z.object({ type: z.enum(["reports", "disputes", "verification"]).default("disputes") });
const auditQuerySchema = z.object({ entityType: z.string().min(1).max(40), entityId: z.string().min(1).max(160) });

function sendMedia(res: Response, media: MediaDocument, variant: string) {
  let bytes: Buffer;
  try {
    bytes = decodeImageBytes(variant === "thumbnail" ? media.thumbnailBase64 : media.mainBase64);
  } catch {
    throw new NotFoundException("Photo not found");
  }
  res.setHeader("Content-Type", media.mimeType);
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(bytes);
}

@Controller("admin")
@UseGuards(AuthGuard, RolesGuard)
@RequireRoles("admin")
export class AdminController {
  constructor(
    private readonly reports: ReportService,
    private readonly disputes: DisputeService,
    private readonly reviews: ReviewService,
    private readonly verification: VerificationService,
    private readonly policies: PolicyService,
    private readonly audit: AuditService,
    private readonly moderation: ModerationService,
  ) {}

  @Get("queue")
  async queue(@CurrentUser() user: VerifiedUser, @Query() query: Record<string, unknown>) {
    const { type } = parseOrThrow(queueQuerySchema, query);
    if (type === "reports") return { type, items: await this.reports.queue(user.uid) };
    if (type === "verification") return { type, items: await this.verification.queue(user.uid) };
    return { type, items: await this.disputes.queue(user.uid) };
  }

  // ─── Reports ───

  @Get("reports/:id")
  async report(@CurrentUser() user: VerifiedUser, @Param("id") id: string, @RequestId() requestId: string | null) {
    return this.reports.detailForReviewer(user.uid, id, requestId);
  }

  @Post("reports/:id/assign")
  @HttpCode(HttpStatus.OK)
  async assignReport(@CurrentUser() user: VerifiedUser, @Param("id") id: string, @RequestId() requestId: string | null) {
    return this.reports.assign(user.uid, id, requestId);
  }

  @Post("reports/:id/close")
  @UseInterceptors(new ZodValidationInterceptor(closeReportBodySchema))
  @HttpCode(HttpStatus.OK)
  async closeReport(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Body() body: CloseReportBody,
    @RequestId() requestId: string | null,
  ) {
    return this.reports.close(user.uid, id, body, requestId);
  }

  /** Moderation decision: invalid, warn (low), take_down (medium) or suspend (high). */
  @Post("reports/:id/decide")
  @UseInterceptors(new ZodValidationInterceptor(decideReportBodySchema))
  @HttpCode(HttpStatus.OK)
  async decideReport(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Body() body: DecideReportBody,
    @RequestId() requestId: string | null,
  ) {
    return this.moderation.decide(user.uid, id, body, requestId);
  }

  // ─── Moderation follow-up ───

  @Get("moderation")
  async moderationOverview() {
    return this.moderation.overview();
  }

  @Post("listings/:id/restore")
  @UseInterceptors(new ZodValidationInterceptor(moderationReasonBodySchema))
  @HttpCode(HttpStatus.OK)
  async restoreListing(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Body() body: ModerationReasonBody,
    @RequestId() requestId: string | null,
  ) {
    return this.moderation.restoreListing(user.uid, id, body.reason, requestId);
  }

  @Post("members/:uid/reinstate")
  @UseInterceptors(new ZodValidationInterceptor(moderationReasonBodySchema))
  @HttpCode(HttpStatus.OK)
  async reinstateMember(
    @CurrentUser() user: VerifiedUser,
    @Param("uid") uid: string,
    @Body() body: ModerationReasonBody,
    @RequestId() requestId: string | null,
  ) {
    return this.moderation.reinstateMember(user.uid, uid, body.reason, requestId);
  }

  @Get("reports/:id/media/:mediaId")
  async reportPhoto(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Param("mediaId") mediaId: string,
    @Query("variant") variant: string,
    @RequestId() requestId: string | null,
    @Res() res: Response,
  ) {
    sendMedia(res, await this.reports.evidencePhoto(user.uid, id, mediaId, requestId), variant);
  }

  // ─── Disputes ───

  @Get("disputes/:id/evidence")
  async evidence(@CurrentUser() user: VerifiedUser, @Param("id") id: string, @RequestId() requestId: string | null) {
    return this.disputes.evidence(user.uid, id, requestId);
  }

  @Post("disputes/:id/assign")
  @HttpCode(HttpStatus.OK)
  async assignDispute(@CurrentUser() user: VerifiedUser, @Param("id") id: string, @RequestId() requestId: string | null) {
    return this.disputes.assign(user.uid, id, requestId);
  }

  @Post("disputes/:id/resolve")
  @UseInterceptors(new ZodValidationInterceptor(resolveDisputeBodySchema))
  @HttpCode(HttpStatus.OK)
  async resolve(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Body() body: ResolveDisputeBody,
    @RequestId() requestId: string | null,
  ) {
    return this.disputes.resolve(user.uid, id, body, requestId);
  }

  @Get("disputes/:id/media/:mediaId")
  async disputePhoto(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Param("mediaId") mediaId: string,
    @Query("variant") variant: string,
    @RequestId() requestId: string | null,
    @Res() res: Response,
  ) {
    sendMedia(res, await this.disputes.evidencePhoto(user.uid, id, mediaId, requestId), variant);
  }

  // ─── Reviews, verification, policies ───

  @Post("reviews/:id/hide")
  @UseInterceptors(new ZodValidationInterceptor(hideReviewBodySchema))
  @HttpCode(HttpStatus.OK)
  async hideReview(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Body() body: HideReviewBody,
    @RequestId() requestId: string | null,
  ) {
    return this.reviews.hide(user.uid, id, body.reason, requestId);
  }

  @Post("verification/:id/decide")
  @UseInterceptors(new ZodValidationInterceptor(decideVerificationBodySchema))
  @HttpCode(HttpStatus.OK)
  async decideVerification(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Body() body: DecideVerificationBody,
    @RequestId() requestId: string | null,
  ) {
    return this.verification.decide(user.uid, id, body, requestId);
  }

  @Post("policies/:id/publish")
  @HttpCode(HttpStatus.OK)
  async publishPolicy(@CurrentUser() user: VerifiedUser, @Param("id") id: string, @RequestId() requestId: string | null) {
    return this.policies.publish(user.uid, id, requestId);
  }

  @Get("audit")
  async auditTrail(@Query() query: Record<string, unknown>) {
    const { entityType, entityId } = parseOrThrow(auditQuerySchema, query);
    return { items: await this.audit.listFor(entityType, entityId) };
  }
}
