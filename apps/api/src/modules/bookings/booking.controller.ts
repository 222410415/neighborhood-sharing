/**
 * Booking controller — participant-only booking routes.
 *
 * POST /v1/me/bookings                                   — request or instant booking
 * GET  /v1/me/bookings?role=borrower|owner&status=       — Borrowing / Lending lists
 * GET  /v1/me/bookings/:id                               — detail (404 for non-participants)
 * POST /v1/me/bookings/:id/{accept,decline,confirm,cancel}
 * PUT  /v1/me/bookings/:id/arrangements/{pickup,return}
 * POST /v1/me/bookings/:id/arrangements/{pickup,return}/acknowledge
 * POST /v1/me/bookings/:id/condition/{collection,return}
 * POST /v1/me/bookings/:id/condition/collection/acknowledge
 * POST /v1/me/bookings/:id/condition/{collection,return}/correct — new version (Sprint 3)
 * POST /v1/me/bookings/:id/{report-return,confirm-receipt,report-issue}
 * POST /v1/me/bookings/:id/dispute                       — open a case (Sprint 3)
 * GET  /v1/me/bookings/:id/media/:mediaId?variant=       — condition photo (participants only)
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Res,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import type { Response } from "express";
import {
  acknowledgeArrangementBodySchema,
  arrangementBodySchema,
  arrangementKindSchema,
  bookingCommandBodySchema,
  cancelBookingBodySchema,
  conditionAcknowledgeBodySchema,
  conditionReportBodySchema,
  conditionStageSchema,
  createBookingBodySchema,
  listBookingsQuerySchema,
  openDisputeBodySchema,
  reportIssueBodySchema,
  type AcknowledgeArrangementBody,
  type ArrangementBody,
  type BookingCommandBody,
  type CancelBookingBody,
  type ConditionAcknowledgeBody,
  type ConditionReportBody,
  type CreateBookingBody,
  type OpenDisputeBody,
  type ReportIssueBody,
} from "@neighborhood/contracts";
import { AuthGuard, type VerifiedUser } from "../../common/guards/auth.guard.js";
import { CurrentUser } from "../../common/guards/current-user.decorator.js";
import { ZodValidationInterceptor } from "../../common/validation/zod-validation.interceptor.js";
import { parseOrThrow } from "../../common/validation/parse.js";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit/rate-limit.guard.js";
import { BookingService } from "./booking.service.js";
import { BookingQueryService } from "./booking-query.service.js";
import { HandoverService } from "./handover.service.js";

@Controller("me/bookings")
@UseGuards(AuthGuard)
export class BookingController {
  constructor(
    private readonly bookings: BookingService,
    private readonly queries: BookingQueryService,
    private readonly handover: HandoverService,
  ) {}

  @Post()
  @UseGuards(RateLimitGuard)
  @RateLimit("bookings")
  @UseInterceptors(new ZodValidationInterceptor(createBookingBodySchema))
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: VerifiedUser, @Body() body: CreateBookingBody) {
    return this.bookings.create(user.uid, body);
  }

  @Get()
  async list(@CurrentUser() user: VerifiedUser, @Query() query: Record<string, unknown>) {
    const { role, status } = parseOrThrow(listBookingsQuerySchema, query);
    return { items: await this.queries.list(user.uid, role, status) };
  }

  @Get(":id")
  async detail(@CurrentUser() user: VerifiedUser, @Param("id") id: string) {
    return this.queries.detail(user.uid, id);
  }

  // ─── Decisions ───

  @Post(":id/accept")
  @UseInterceptors(new ZodValidationInterceptor(bookingCommandBodySchema))
  @HttpCode(HttpStatus.OK)
  async accept(@CurrentUser() user: VerifiedUser, @Param("id") id: string, @Body() body: BookingCommandBody) {
    return this.bookings.accept(user.uid, id, body.expectedRevision);
  }

  @Post(":id/decline")
  @UseInterceptors(new ZodValidationInterceptor(bookingCommandBodySchema))
  @HttpCode(HttpStatus.OK)
  async decline(@CurrentUser() user: VerifiedUser, @Param("id") id: string, @Body() body: BookingCommandBody) {
    return this.bookings.decline(user.uid, id, body.expectedRevision);
  }

  @Post(":id/confirm")
  @UseInterceptors(new ZodValidationInterceptor(bookingCommandBodySchema))
  @HttpCode(HttpStatus.OK)
  async confirm(@CurrentUser() user: VerifiedUser, @Param("id") id: string, @Body() body: BookingCommandBody) {
    return this.bookings.confirm(user.uid, id, body.expectedRevision);
  }

  @Post(":id/cancel")
  @UseInterceptors(new ZodValidationInterceptor(cancelBookingBodySchema))
  @HttpCode(HttpStatus.OK)
  async cancel(@CurrentUser() user: VerifiedUser, @Param("id") id: string, @Body() body: CancelBookingBody) {
    return this.bookings.cancel(user.uid, id, body);
  }

  // ─── Arrangements ───

  @Put(":id/arrangements/:kind")
  @UseInterceptors(new ZodValidationInterceptor(arrangementBodySchema))
  async saveArrangement(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Param("kind") kind: string,
    @Body() body: ArrangementBody,
  ) {
    return this.handover.saveArrangement(user.uid, id, parseOrThrow(arrangementKindSchema, kind), body);
  }

  @Post(":id/arrangements/:kind/acknowledge")
  @UseInterceptors(new ZodValidationInterceptor(acknowledgeArrangementBodySchema))
  @HttpCode(HttpStatus.OK)
  async acknowledgeArrangement(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Param("kind") kind: string,
    @Body() body: AcknowledgeArrangementBody,
  ) {
    return this.handover.acknowledgeArrangement(user.uid, id, parseOrThrow(arrangementKindSchema, kind), body);
  }

  // ─── Condition records ───

  @Post(":id/condition/collection/acknowledge")
  @UseInterceptors(new ZodValidationInterceptor(conditionAcknowledgeBodySchema))
  @HttpCode(HttpStatus.OK)
  async acknowledgeCollection(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Body() body: ConditionAcknowledgeBody,
  ) {
    return this.handover.acknowledgeCollection(user.uid, id, body);
  }

  @Post(":id/condition/:stage/correct")
  @UseInterceptors(new ZodValidationInterceptor(conditionReportBodySchema))
  @HttpCode(HttpStatus.CREATED)
  async correctCondition(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Param("stage") stage: string,
    @Body() body: ConditionReportBody,
  ) {
    const report = await this.handover.correctConditionReport(
      user.uid,
      id,
      parseOrThrow(conditionStageSchema, stage),
      body,
    );
    const { clientRequestId: _c, ...dto } = report;
    return dto;
  }

  @Post(":id/condition/:stage")
  @UseInterceptors(new ZodValidationInterceptor(conditionReportBodySchema))
  @HttpCode(HttpStatus.CREATED)
  async submitCondition(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Param("stage") stage: string,
    @Body() body: ConditionReportBody,
  ) {
    const report = await this.handover.submitConditionReport(
      user.uid,
      id,
      parseOrThrow(conditionStageSchema, stage),
      body,
    );
    const { clientRequestId: _c, ...dto } = report;
    return dto;
  }

  // ─── Return and closure ───

  @Post(":id/report-return")
  @UseInterceptors(new ZodValidationInterceptor(bookingCommandBodySchema))
  @HttpCode(HttpStatus.OK)
  async reportReturn(@CurrentUser() user: VerifiedUser, @Param("id") id: string, @Body() body: BookingCommandBody) {
    return this.handover.reportReturn(user.uid, id, body.expectedRevision);
  }

  @Post(":id/confirm-receipt")
  @UseInterceptors(new ZodValidationInterceptor(bookingCommandBodySchema))
  @HttpCode(HttpStatus.OK)
  async confirmReceipt(@CurrentUser() user: VerifiedUser, @Param("id") id: string, @Body() body: BookingCommandBody) {
    return this.handover.confirmReceipt(user.uid, id, body.expectedRevision);
  }

  @Post(":id/dispute")
  @UseInterceptors(new ZodValidationInterceptor(openDisputeBodySchema))
  @HttpCode(HttpStatus.CREATED)
  async openDispute(@CurrentUser() user: VerifiedUser, @Param("id") id: string, @Body() body: OpenDisputeBody) {
    const { dispute } = await this.handover.openDispute(user.uid, id, body);
    return dispute;
  }

  @Post(":id/report-issue")
  @UseInterceptors(new ZodValidationInterceptor(reportIssueBodySchema))
  @HttpCode(HttpStatus.OK)
  async reportIssue(@CurrentUser() user: VerifiedUser, @Param("id") id: string, @Body() body: ReportIssueBody) {
    return this.handover.reportIssue(user.uid, id, body);
  }

  // ─── Condition photos ───

  @Get(":id/media/:mediaId")
  async conditionPhoto(
    @CurrentUser() user: VerifiedUser,
    @Param("id") id: string,
    @Param("mediaId") mediaId: string,
    @Query("variant") variant: string,
    @Res() res: Response,
  ) {
    const photo = await this.handover.getConditionPhoto(
      user.uid,
      id,
      mediaId,
      variant === "thumbnail" ? "thumbnail" : "main",
    );
    res.setHeader("Content-Type", photo.mimeType);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(photo.bytes);
  }
}
