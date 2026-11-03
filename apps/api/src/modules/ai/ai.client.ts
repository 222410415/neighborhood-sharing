/**
 * AiClient: calls the OpenAI Chat Completions API with fetch (no SDK dependency).
 *
 * Configuration (environment only; the key is entered by the team):
 *   OPENAI_API_KEY   enables AI; without it every AI feature uses its fallback
 *   OPENAI_MODEL     model name (default below; change without code changes)
 *   OPENAI_BASE_URL  API base (default OpenAI's v1 endpoint)
 *
 * Structured JSON output with a strict schema, an 8-second timeout and one
 * retry on timeouts, network errors, 429 and 5xx. Never called inside a
 * Firestore transaction.
 *
 * Test hooks (AI_TEST_HOOKS=true, refused when NODE_ENV=production): the
 * header x-ai-test-scenario selects a stub instead of the model so the fallback,
 * fabricated-id filtering and the outgoing payload can be checked without a
 * key: "unavailable", "fabricated", "valid", "grounded", "override".
 */

import { Injectable, Logger } from "@nestjs/common";
import { buildChatBody, parseChatResponse } from "./openai-format.js";
import type { ModelRequest } from "./suggestion-prompt.js";

const DEFAULT_MODEL = "gpt-6-luna";
const DEFAULT_BASE = "https://api.openai.com/v1";
const TIMEOUT_MS = 8_000;

export type TestScenario = "unavailable" | "fabricated" | "valid" | "grounded" | "override";

export class AiUnavailableError extends Error {}

export function testHooksEnabled(): boolean {
  return process.env["AI_TEST_HOOKS"] === "true" && process.env["NODE_ENV"] !== "production";
}

/** The scenario requested by a test, or null (hooks off or header absent). */
export function testScenarioFrom(header: unknown): TestScenario | null {
  if (!testHooksEnabled() || typeof header !== "string") return null;
  return (["unavailable", "fabricated", "valid", "grounded", "override"] as const).includes(header as TestScenario)
    ? (header as TestScenario)
    : null;
}

@Injectable()
export class AiClient {
  private readonly logger = new Logger(AiClient.name);

  get enabled(): boolean {
    return !!process.env["OPENAI_API_KEY"];
  }

  get model(): string {
    return process.env["OPENAI_MODEL"] || DEFAULT_MODEL;
  }

  /** Returns the parsed JSON the model produced, or throws AiUnavailableError. */
  async generateJson(request: ModelRequest): Promise<unknown> {
    const key = process.env["OPENAI_API_KEY"];
    if (!key) throw new AiUnavailableError("AI is not enabled");
    const base = process.env["OPENAI_BASE_URL"] || DEFAULT_BASE;
    const url = `${base}/chat/completions`;
    const body = JSON.stringify(buildChatBody(request, this.model));

    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body,
          signal: controller.signal,
        });
        if (res.status === 429 || res.status >= 500) {
          throw new Error(`OpenAI HTTP ${res.status}`);
        }
        if (!res.ok) {
          // Client errors (bad key, bad model) are not retried.
          throw new AiUnavailableError(`OpenAI HTTP ${res.status}`);
        }
        return parseChatResponse(await res.json());
      } catch (err) {
        if (err instanceof AiUnavailableError || attempt === 2) {
          this.logger.warn(`OpenAI unavailable: ${(err as Error).message}`);
          throw new AiUnavailableError((err as Error).message);
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw new AiUnavailableError("OpenAI unavailable");
  }
}
