/**
 * GET /v1/listings/:id/suggestions?from&to — public; an optional bearer token
 * excludes the viewer's own items. Response `source` is "ai" or "category".
 */

import { Controller, Get, Headers, Param, Query, UseGuards } from "@nestjs/common";
import { suggestionsQuerySchema } from "@neighborhood/contracts";
import type { VerifiedUser } from "../../common/guards/auth.guard.js";
import { OptionalAuthGuard } from "../../common/guards/optional-auth.guard.js";
import { CurrentUser } from "../../common/guards/current-user.decorator.js";
import { parseOrThrow } from "../../common/validation/parse.js";
import { RateLimit, RateLimitGuard } from "../../common/rate-limit/rate-limit.guard.js";
import { SuggestionService } from "./suggestion.service.js";
import { testScenarioFrom } from "./gemini.client.js";

@Controller("listings")
export class AiController {
  constructor(private readonly suggestions: SuggestionService) {}

  @Get(":id/suggestions")
  @UseGuards(OptionalAuthGuard, RateLimitGuard)
  @RateLimit("ai")
  async suggest(
    @Param("id") id: string,
    @Query() query: Record<string, unknown>,
    @Headers("x-ai-test-scenario") scenarioHeader?: string,
    @Headers("x-ai-test-ids") testIdsHeader?: string,
    @CurrentUser() user?: VerifiedUser,
  ) {
    const { from, to } = parseOrThrow(suggestionsQuerySchema, query);
    const scenario = testScenarioFrom(scenarioHeader);
    const testIds = scenario && testIdsHeader ? testIdsHeader.split(",").map((s) => s.trim()).filter(Boolean).slice(0, 10) : [];
    return this.suggestions.suggest(id, user?.uid, from && to ? { from, to } : {}, scenario, testIds);
  }
}
