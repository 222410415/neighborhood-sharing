#!/usr/bin/env node
/**
 * Policy assistant evaluation over the 48 dataset questions (English and Arabic).
 *
 * For each question it calls POST /v1/policies/ask as a signed-in demo member
 * and records the answer, the cited policies and three automatic checks:
 *   cited_expected   every expected policy id is among the cited sources
 *   no_action_claim  the answer does not claim to have carried out an action
 *   draft_disclosed  a draft notice is present when the case requires it
 * It writes a JSON file and a CSV with an empty `manual_score` column
 * (correct / partial / wrong) for the team's manual review. Automatic and
 * manual scores are reported separately; nothing is scored by guesswork.
 *
 * Docker (real Firebase, see compose.yaml):
 *   docker compose run --rm tools node scripts/quality/evaluate-policy-assistant.mjs
 * Hosted: API_URL=https://<api>/v1 FIREBASE_WEB_API_KEY=<public key> node scripts/quality/evaluate-policy-assistant.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const API = process.env.API_URL ?? "http://api:3001/v1";
// Signs the demo members in against real Firebase Auth with the public web API key
// (set in compose.yaml for the tools container).
if (!process.env.FIREBASE_WEB_API_KEY) {
  console.error("FIREBASE_WEB_API_KEY is not set (public web API key of the Firebase project).");
  process.exit(1);
}
const SIGN_IN_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_WEB_API_KEY}`;
const EMAIL = process.env.EVAL_EMAIL ?? "hanadi@neighborhood-demo.test";
const PASSWORD = process.env.SEED_USER_PASSWORD ?? "DemoPass123!";
const OUT_DIR = new URL("../../reports/", import.meta.url);
const CASES = new URL("../../seed-data/collections/chatbot_evaluation_cases.json", import.meta.url);

const ACTION_CLAIM =
  /\b(i have|i've|i just|has been|have been|was) (refunded|cancelled|canceled|approved|verified|released|paid|transferred|booked|reserved)\b|تم (استرداد|الاسترداد|إلغاء|الإلغاء|التحقق|الدفع|الحجز)/i;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function signIn() {
  const r = await fetch(SIGN_IN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`sign-in failed: ${JSON.stringify(j).slice(0, 200)}`);
  return j.idToken;
}

async function ask(token, question) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const started = Date.now();
    const r = await fetch(`${API}/policies/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ question }),
    });
    const latencyMs = Date.now() - started;
    if (r.status === 429) {
      const wait = Number(r.headers.get("retry-after") ?? "10");
      process.stdout.write(`  rate limited, waiting ${wait}s\n`);
      await sleep((wait + 1) * 1000);
      continue;
    }
    const body = await r.json();
    return { status: r.status, body, latencyMs };
  }
  throw new Error("Too many rate-limit retries");
}

const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;

const cases = JSON.parse(readFileSync(CASES, "utf-8"));
const token = await signIn();
const runAt = new Date().toISOString();
const rows = [];
console.log(`Policy assistant evaluation: ${cases.length} questions against ${API}`);

for (const c of cases) {
  const { status, body, latencyMs } = await ask(token, c.question);
  const cited = (body.sources ?? []).map((s) => s.policyKey);
  const row = {
    id: c.id,
    locale: c.locale,
    question: c.question,
    expected_policy_ids: c.expected_policy_ids.join(" "),
    expected_behavior_en: c.expected_behavior_en,
    http_status: status,
    generated: body.generated ?? "",
    can_answer: body.canAnswer ?? "",
    cited_policy_ids: cited.join(" "),
    cited_expected: c.expected_policy_ids.every((k) => cited.includes(k)),
    cited_any_expected: c.expected_policy_ids.some((k) => cited.includes(k)),
    no_action_claim: !ACTION_CLAIM.test(body.answer ?? ""),
    draft_disclosed: c.must_disclose_draft_demo_context ? !!body.draftNotice : true,
    latency_ms: latencyMs,
    answer: body.answer ?? JSON.stringify(body.error ?? body).slice(0, 300),
    manual_score: "",
    reviewer_note: "",
  };
  rows.push(row);
  console.log(
    `${row.id} | ${status} | ${row.generated} | cited ${row.cited_policy_ids || "-"} | expected ${row.cited_expected ? "yes" : "no"} | no-action ${row.no_action_claim ? "yes" : "NO"} | draft ${row.draft_disclosed ? "yes" : "NO"}`,
  );
}

const count = (key) => rows.filter((r) => r[key] === true).length;
const summary = {
  runAt,
  api: API,
  questions: rows.length,
  aiGenerated: rows.filter((r) => r.generated === "ai").length,
  extractive: rows.filter((r) => r.generated === "extractive").length,
  noAnswer: rows.filter((r) => r.generated === "none").length,
  automatic: {
    citedAllExpected: count("cited_expected"),
    citedAnyExpected: count("cited_any_expected"),
    noActionClaim: count("no_action_claim"),
    draftDisclosedWhenRequired: count("draft_disclosed"),
  },
  manual: "Not scored yet: fill manual_score (correct, partial, wrong) in the CSV, then run scripts/quality/summarize-policy-evaluation.mjs.",
};

mkdirSync(OUT_DIR, { recursive: true });
const stamp = runAt.slice(0, 10);
writeFileSync(new URL(`policy-assistant-${stamp}.json`, OUT_DIR), JSON.stringify({ summary, rows }, null, 2));
const header = Object.keys(rows[0] ?? {});
writeFileSync(
  new URL(`policy-assistant-${stamp}.csv`, OUT_DIR),
  [header.join(","), ...rows.map((r) => header.map((h) => csvCell(r[h])).join(","))].join("\n"),
);
console.log("\nAutomatic results:", JSON.stringify(summary.automatic));
console.log(`AI-generated ${summary.aiGenerated}, extractive ${summary.extractive}, no answer ${summary.noAnswer}`);
console.log(`Written reports/policy-assistant-${stamp}.json and .csv`);
