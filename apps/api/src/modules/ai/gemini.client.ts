/**
 * GeminiClient — calls the Gemini REST API with fetch (no SDK dependency).
 *
 * Configuration (environment only; the key is entered by the team):
 *   GEMINI_API_KEY   enables AI; without it every AI feature uses its fallback
 *   GEMINI_MODEL     model name (default below; change without code changes)
 *   GEMINI_BASE_URL  API base (default Google's v1beta endpoint)
 *
 * Structured JSON output with a response schema, an 8-second timeout and one
 * retry on timeouts, network errors, 429 and 5xx. Never called inside a
 * Firestore transaction.
 *
 * Test hooks (AI_TEST_HOOKS=true, refused when NODE_ENV=production): the
 * header x-ai-test-scenario selects a stub instead of Gemini so the fallback,
 * fabricated-id filtering and the outgoing payload can be checked without a
 * key: "unavailable", "fabricated", "valid", "grounded", "override".
 */

import { Injectable, Logger } from "@nestjs/common";
import type { ModelRequest } from "./suggestion-prompt.js";

const DEFAULT_MODEL = "gemini-2.5-flash";
const DEFAULT_BASE = "https://generativelanguage.googleapis.com/v1beta";
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
export class GeminiClient {
  private readonly logger = new Logger(GeminiClient.name);

  get enabled(): boolean {
    return !!process.env["GEMINI_API_KEY"];
  }

  get model(): string {
    return process.env["GEMINI_MODEL"] || DEFAULT_MODEL;
  }

  /** Returns the parsed JSON the model produced, or throws AiUnavailableError. */
  async generateJson(request: ModelRequest): Promise<unknown> {
    const key = process.env["GEMINI_API_KEY"];
    if (!key) throw new AiUnavailableError("AI is not enabled");
    const base = process.env["GEMINI_BASE_URL"] || DEFAULT_BASE;
    const url = `${base}/models/${encodeURIComponent(this.model)}:generateContent`;
    const body = JSON.stringify({
      systemInstruction: { parts: [{ text: request.system }] },
      contents: [{ role: "user", parts: [{ text: request.user }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: request.schema,
        temperature: 0.2,
        maxOutputTokens: 1024,
      },
    });

    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body,
          signal: controller.signal,
        });
        if (res.status === 429 || res.status >= 500) {
          throw new Error(`Gemini HTTP ${res.status}`);
        }
        if (!res.ok) {
          // Client errors (bad key, bad model) are not retried.
          throw new AiUnavailableError(`Gemini HTTP ${res.status}`);
        }
        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
        return JSON.parse(text);
      } catch (err) {
        if (err instanceof AiUnavailableError || attempt === 2) {
          this.logger.warn(`Gemini unavailable: ${(err as Error).message}`);
          throw new AiUnavailableError((err as Error).message);
        }
      } finally {
        clearTimeout(timer);
      }
    }
    throw new AiUnavailableError("Gemini unavailable");
  }
}
