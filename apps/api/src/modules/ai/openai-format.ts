/**
 * OpenAI Chat Completions request and response format (pure, no I/O).
 *
 * Structured Outputs with strict: true needs every object to list all of its
 * properties under `required` and to set additionalProperties: false.
 * Reasoning is off: these are short ranking and citation tasks with an
 * 8-second budget. No temperature is sent, so a model that does not accept one
 * is not refused.
 */

import type { ModelRequest } from "./suggestion-prompt.js";

export const MAX_OUTPUT_TOKENS = 1024;

export function buildChatBody(request: ModelRequest, model: string): Record<string, unknown> {
  return {
    model,
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.user },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: request.schemaName, strict: true, schema: request.schema },
    },
    reasoning_effort: "none",
    max_completion_tokens: MAX_OUTPUT_TOKENS,
  };
}

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[];
}

/** The parsed JSON the model produced; throws when the answer is empty or not JSON. */
export function parseChatResponse(data: unknown): unknown {
  const text = (data as ChatResponse).choices?.[0]?.message?.content ?? "";
  return JSON.parse(text);
}
