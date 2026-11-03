/**
 * GET  /v1/me/verification             — email status, checks and public labels
 * POST /v1/me/verification/email/sync  — record the Firebase email-verified state
 * POST /v1/me/verification/demo-check  — request a labelled demonstration check
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards, UseInterceptors } from "@nestjs/common";
import { demoCheckBodySchema, type DemoCheckBody } from "@neighborhood/contracts";
import { AuthGuard, type VerifiedUser } from "../../common/guards/auth.guard.js";
import { CurrentUser } from "../../common/guards/current-user.decorator.js";
import { ZodValidationInterceptor } from "../../common/validation/zod-validation.interceptor.js";
import { VerificationService } from "./verification.service.js";

@Controller("me/verification")
@UseGuards(AuthGuard)
export class VerificationController {
  constructor(private readonly verification: VerificationService) {}

  @Get()
  async status(@CurrentUser() user: VerifiedUser) {
    return this.verification.status(user.uid);
  }

  @Post("email/sync")
  @HttpCode(HttpStatus.OK)
  async sync(@CurrentUser() user: VerifiedUser) {
    return this.verification.syncEmail(user.uid);
  }

  @Post("demo-check")
  @UseInterceptors(new ZodValidationInterceptor(demoCheckBodySchema))
  @HttpCode(HttpStatus.OK)
  async demoCheck(@CurrentUser() user: VerifiedUser, @Body() body: DemoCheckBody) {
    return this.verification.requestDemoCheck(user.uid, body.type);
  }
}
