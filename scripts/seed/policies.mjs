#!/usr/bin/env node
/**
 * Policy seed: imports the 12 bilingual policies and 24 policy passages.
 * Policies marked approved in the dataset (approved by the project team on
 * 4 November 2026, version 1.0) are imported as published; others as drafts.
 * Later versions are published by an admin (policy page, or
 * scripts/admin/publish-policies.mjs).
 *
 * Idempotent: existing policy versions are never overwritten (so a published
 * version stays published); missing ones are added.
 *
 * Docker (tools container, real project; key from FIREBASE_KEY_FILE in .env):
 *   docker compose run --rm tools node scripts/seed/policies.mjs
 * Without Docker: GOOGLE_APPLICATION_CREDENTIALS=/path/key.json node scripts/seed/policies.mjs
 */

import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
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

console.log("=== Policy seed ===");
console.log(`Target: real Firestore (project ${PROJECT_ID})`);

let added = 0;
let kept = 0;
let published = 0;
for (const p of policies) {
  const id = `${p.id}_${p.version}`;
  const ref = db.collection("policies").doc(id);
  if ((await ref.get()).exists) {
    kept++;
    continue;
  }
  // Policies the team approved (status "approved" in the dataset) are imported
  // as published, with an audit event; anything else stays a draft until an
  // admin publishes it (scripts/admin/publish-policies.mjs or the policy page).
  const approved = p.status === "approved" && p.production_approved === true;
  await ref.set({
    id,
    policyKey: p.id,
    version: p.version,
    titleEn: p.title_en,
    titleAr: p.title_ar,
    bodyEn: p.body_en,
    bodyAr: p.body_ar,
    status: approved ? "published" : "draft",
    isDemoDraft: !approved,
    approvedByUid: approved ? "seed:approved-dataset" : null,
    approvedAt: approved ? p.approved_at ?? now : null,
    effectiveAt: approved ? p.effective_at ?? p.approved_at ?? now : p.effective_at ?? null,
    importedAt: now,
    sourceStatus: p.status,
  });
  if (approved) {
    const eventId = `aud_${now.replace(/[-:.TZ]/g, "")}_${randomUUID().slice(0, 8)}`;
    await db.collection("auditEvents").doc(eventId).set({
      id: eventId, actorUid: "seed:approved-dataset", action: "policy.publish", entityType: "policy", entityId: id,
      occurredAt: now, requestId: null, reason: (p.approval_note ?? "Approved in the seed dataset").slice(0, 300),
      summary: { policyKey: p.id, version: p.version },
    });
    published++;
  }
  added++;
}
console.log(`  policies added: ${added} (published as approved: ${published}), already present: ${kept}`);

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
  { version: "sprint3-v1", seededAt: now, policiesAdded: added, passagesAdded: chunksAdded, note: "Approved policies imported as published; others as drafts." },
  { merge: true },
);
console.log("Done. Unapproved policies stay drafts until an admin publishes them.");
