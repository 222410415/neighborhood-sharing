/**
 * Member-facing trust routes.
 *
 * POST /v1/me/reports                  — report a listing, message, review or member
 * GET  /v1/me/reports                  — my reports
 * GET  /v1/me/disputes/:id             — case view (participants only)
 * POST /v1/me/disputes/:id/statement   — add a statement (participants only)
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards, UseInterceptors } from "@nestjs/common";
import {
  createReportBodySchema,
  disputeStatementBodySchema,
  type CreateReportBody,
  type DisputeStatementBody,
} from "@neighborhood/contracts";
import { AuthGuard, type VerifiedUser } from "../../common/guards/auth.guard.js";
import { CurrentUser } from "../../common/guards/current-user.decorator.js";
import { ZodValidationInterceptor } from "../../common/validation/zod-validation.interceptor.js";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit/rate-limit.guard.js";
import { ReportService } from "./report.service.js";
import { DisputeService } from "./dispute.service.js";

@Controller("me")
@UseGuards(AuthGuard)
export class TrustController {
  constructor(
    private readonly reports: ReportService,
    private readonly disputes: DisputeService,
  ) {}

  @Post("reports")
  @UseGuards(RateLimitGuard)
  @RateLimit("reports")
  @UseInterceptors(new ZodValidationInterceptor(createReportBodySchema))
  @HttpCode(HttpStatus.CREATED)
  async report(@CurrentUser() user: VerifiedUser, @Body() body: CreateReportBody) {
    return this.reports.create(user.uid, body);
  }

  @Get("reports")
  async myReports(@CurrentUser() user: VerifiedUser) {
    return { items: await this.reports.listMine(user.uid) };
  }

  @Get("disputes/:id")
  async dispute(@CurrentUser() user: VerifiedUser, @Param("id") id: string) {
    return this.disputes.getForParticipant(user.uid, id);
  }

  @Post("disputes/:id/statement")
  @UseInterceptors(new ZodValidationInterceptor(disputeStatementBodySchema))
  @HttpCode(HttpStatus.OK)
  async statement(@CurrentUser() user: VerifiedUser, @Param("id") id: string, @Body() body: DisputeStatementBody) {
    return this.disputes.addStatement(user.uid, id, body.text);
  }
}
