#!/usr/bin/env node
/**
 * Policy seed: imports the 12 bilingual policies and 24 policy passages
 * from the dataset as DEMONSTRATION DRAFTS (status "draft", isDemoDraft true).
 * They become published only when an admin records the team's approval
 * (POST /v1/admin/policies/:id/publish, plan gate G3).
 *
 * Idempotent: existing policy versions are never overwritten (so a published
 * version stays published); missing ones are added.
 *
 * Docker (tools container, real project; key from FIREBASE_KEY_FILE in .env):
 *   docker compose run --rm tools node scripts/seed/policies.mjs
 * Without Docker: GOOGLE_APPLICATION_CREDENTIALS=/path/key.json node scripts/seed/policies.mjs
 * Real project (on the Mac; the key stays local):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/key.json FIREBASE_PROJECT_ID=<id> node scripts/seed/policies.mjs
 */

import { createRequire } from "node:module";
import { initFirebaseAdmin } from "../lib/firebase-admin.mjs";
import { readFileSync } from "node:fs";

const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const { getFirestore } = require("firebase-admin/firestore");

const DATA = new URL("../../seed-data/collections/", import.meta.url);
const PROJECT_ID = initFirebaseAdmin();


const db = getFirestore();
db.settings({ preferRest: true, ignoreUndefinedProperties: true });

const read = (name) => JSON.parse(readFileSync(new URL(`${name}.json`, DATA), "utf-8"));
const normalize = (t) =>
  t
    .toLowerCase()
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2);

const now = new Date().toISOString();
const policies = read("policies");
const chunks = read("policy_chunks");

console.log("=== Policy seed (demonstration drafts) ===");
console.log(`Target: real Firestore (project ${PROJECT_ID})`);

let added = 0;
let kept = 0;
for (const p of policies) {
  const id = `${p.id}_${p.version}`;
  const ref = db.collection("policies").doc(id);
  if ((await ref.get()).exists) {
    kept++;
    continue;
  }
  await ref.set({
    id,
    policyKey: p.id,
    version: p.version,
    titleEn: p.title_en,
    titleAr: p.title_ar,
    bodyEn: p.body_en,
    bodyAr: p.body_ar,
    status: "draft",
    isDemoDraft: true,
    approvedByUid: null,
    approvedAt: null,
    effectiveAt: p.effective_at ?? null,
    importedAt: now,
    sourceStatus: p.status,
  });
  added++;
}
console.log(`  policies added: ${added}, already present: ${kept}`);

let chunksAdded = 0;
for (const c of chunks) {
  const ref = db.collection("policyChunks").doc(c.id);
  if ((await ref.get()).exists) continue;
  await ref.set({
    id: c.id,
    policyVersionId: `${c.policy_id}_${c.version}`,
    policyKey: c.policy_id,
    version: c.version,
    locale: c.locale,
    topic: c.policy_id.replace(/^pol_/, ""),
    text: c.text,
    sequence: 0,
    tokens: [...new Set(normalize(c.text))].slice(0, 80),
  });
  chunksAdded++;
}
console.log(`  passages added: ${chunksAdded}`);

await db.collection("seedManifests").doc("sprint3-v1").set(
  { version: "sprint3-v1", seededAt: now, policiesAdded: added, passagesAdded: chunksAdded, note: "Policies imported as demonstration drafts." },
  { merge: true },
);
console.log("Done. Policies stay labelled as demonstration drafts until an admin publishes approved versions.");
