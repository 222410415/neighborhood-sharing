/**
 * GET  /v1/policies        — current policy versions (public; draft label included)
 * GET  /v1/policies/:key   — one policy (public)
 * POST /v1/policies/ask    — policy assistant (signed in, rate limited)
 */

import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Post, UseGuards, UseInterceptors } from "@nestjs/common";
import { askPolicyBodySchema, type AskPolicyBody } from "@neighborhood/contracts";
import { AuthGuard, type VerifiedUser } from "../../common/guards/auth.guard.js";
import { CurrentUser } from "../../common/guards/current-user.decorator.js";
import { ZodValidationInterceptor } from "../../common/validation/zod-validation.interceptor.js";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit/rate-limit.guard.js";
import { testScenarioFrom } from "../ai/ai.client.js";
import { PolicyService } from "./policy.service.js";
import { AssistantService } from "./assistant.service.js";

@Controller("policies")
export class PolicyController {
  constructor(
    private readonly policies: PolicyService,
    private readonly assistant: AssistantService,
  ) {}

  @Get()
  async list() {
    return { items: await this.policies.list() };
  }

  @Post("ask")
  @UseGuards(AuthGuard, RateLimitGuard)
  @RateLimit("policy")
  @UseInterceptors(new ZodValidationInterceptor(askPolicyBodySchema))
  @HttpCode(HttpStatus.OK)
  async ask(
    @CurrentUser() user: VerifiedUser,
    @Body() body: AskPolicyBody,
    @Headers("x-ai-test-scenario") scenario?: string,
  ) {
    return this.assistant.ask(user.uid, body, testScenarioFrom(scenario));
  }

  @Get(":key")
  async get(@Param("key") key: string) {
    return this.policies.get(key);
  }
}
