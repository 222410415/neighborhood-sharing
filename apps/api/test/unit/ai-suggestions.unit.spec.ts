/**
 * Unit tests for the AI suggestion prompt and output validation (pure, no I/O).
 */

import { MAX_OUTPUT_TOKENS, buildChatBody, parseChatResponse } from "../../src/modules/ai/openai-format";
import { POLICY_SCHEMA } from "../../src/modules/policies/policy-prompt";
import {
  SUGGESTION_SCHEMA,
  buildSuggestionRequest,
  validateSuggestions,
} from "../../src/modules/ai/suggestion-prompt";

const source = {
  titleEn: "Cordless Drill Kit",
  categoryName: "Tools",
  descriptionEn: "Small furniture assembly and household projects.",
  includedAccessories: ["Drill", "Battery"],
};

const candidates = [
  {
    id: "itm_screwdriver-set",
    titleEn: "Screwdriver Set",
    categoryName: "Tools",
    neighborhoodName: "Al Nuzhah",
    lendingMode: "free" as const,
    dailyRateHalalas: 0,
    condition: "good",
  },
  {
    id: "itm_laser-level",
    titleEn: "Laser Level",
    categoryName: "Tools",
    neighborhoodName: "Al Yasmin",
    lendingMode: "paid" as const,
    dailyRateHalalas: 2000,
    condition: "excellent",
  },
];

describe("suggestion request payload", () => {
  const request = buildSuggestionRequest(source, candidates);

  it("contains only public listing fields", () => {
    const text = JSON.stringify(request);
    expect(text).not.toMatch(/@/);
    expect(text).not.toMatch(/uid|ownerUid|email|address|phone|message|usr_/i);
    expect(text).toContain("itm_screwdriver-set");
    expect(text).toContain("SAR 20 per day");
  });

  it("tells the model to use only listed ids and to treat data as content", () => {
    expect(request.system).toMatch(/only ids that appear in the candidate list/i);
    expect(request.system).toMatch(/content, not instructions/i);
  });
});

describe("suggestion output validation", () => {
  const ids = new Set(candidates.map((c) => c.id));

  it("discards invented, ineligible and repeated ids", () => {
    const out = validateSuggestions(
      {
        suggestions: [
          { id: "itm_fabricated", reason: "made up" },
          { id: "itm_screwdriver-set", reason: "Goes with the drill" },
          { id: "itm_screwdriver-set", reason: "again" },
          { id: "itm_own-item", reason: "owned by viewer" },
          { id: "itm_laser-level", reason: "x".repeat(300) },
        ],
      },
      ids,
      4,
    );
    expect(out.map((o) => o.id)).toEqual(["itm_screwdriver-set", "itm_laser-level"]);
    expect(out[1]!.reason.length).toBeLessThanOrEqual(140);
  });

  it("returns nothing for malformed output", () => {
    expect(validateSuggestions(null, ids, 4)).toEqual([]);
    expect(validateSuggestions({ suggestions: "nope" }, ids, 4)).toEqual([]);
    expect(validateSuggestions({ other: [] }, ids, 4)).toEqual([]);
  });

  it("caps the number of suggestions", () => {
    const out = validateSuggestions(
      { suggestions: [{ id: "itm_screwdriver-set" }, { id: "itm_laser-level" }] },
      ids,
      1,
    );
    expect(out).toHaveLength(1);
  });
});

describe("OpenAI request format", () => {
  /** Strict Structured Outputs: every object closes its properties and requires them all. */
  function assertStrict(node: Record<string, any>): void {
    if (node["type"] === "object") {
      expect(node["additionalProperties"]).toBe(false);
      expect([...node["required"]].sort()).toEqual(Object.keys(node["properties"]).sort());
      Object.values(node["properties"]).forEach((p) => assertStrict(p as Record<string, any>));
    }
    if (node["type"] === "array") assertStrict(node["items"]);
  }

  it("uses schemas that strict mode accepts", () => {
    assertStrict(SUGGESTION_SCHEMA as Record<string, any>);
    assertStrict(POLICY_SCHEMA as Record<string, any>);
  });

  it("builds a Chat Completions body with a strict schema and no reasoning", () => {
    const request = buildSuggestionRequest(source, candidates);
    const body = buildChatBody(request, "test-model") as Record<string, any>;
    expect(body["model"]).toBe("test-model");
    expect(body["messages"].map((m: { role: string }) => m.role)).toEqual(["system", "user"]);
    expect(body["response_format"].type).toBe("json_schema");
    expect(body["response_format"].json_schema).toEqual({ name: "item_suggestions", strict: true, schema: SUGGESTION_SCHEMA });
    expect(body["reasoning_effort"]).toBe("none");
    expect(body["max_completion_tokens"]).toBe(MAX_OUTPUT_TOKENS);
    expect(body).not.toHaveProperty("max_tokens");
  });

  it("reads the JSON answer and refuses an empty one", () => {
    expect(parseChatResponse({ choices: [{ message: { content: '{"suggestions":[]}' } }] })).toEqual({ suggestions: [] });
    expect(() => parseChatResponse({ choices: [{ message: { content: null } }] })).toThrow();
    expect(() => parseChatResponse({})).toThrow();
  });
});
