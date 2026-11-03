#!/usr/bin/env node
/**
 * Publishes policy versions after the team's approval, with the same changes as
 * POST /v1/admin/policies/:id/publish: status "published", isDemoDraft false,
 * approvedAt/effectiveAt, earlier published version of the key retired, and an
 * audit event in the same transaction. Use it when no admin account should be
 * used for the step (the approval is recorded as the project team's).
 *
 * DRY RUN BY DEFAULT.
 *   node scripts/admin/publish-policies.mjs --all [--apply] [--note "Approved by ..."]
 *   node scripts/admin/publish-policies.mjs --ids pol_deposit,pol_booking [--apply]
 *   Docker: docker compose run --rm tools node scripts/admin/publish-policies.mjs --all --apply
 */
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import { initFirebaseAdmin } from "../lib/firebase-admin.mjs";

const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const { getFirestore } = require("firebase-admin/firestore");

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const arg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const NOTE = (arg("--note") ?? "Approved by the project team").slice(0, 300);
const IDS = arg("--ids")?.split(",").map((s) => s.trim()).filter(Boolean);
if (!IDS && !args.includes("--all")) { console.error("Give --all or --ids <id,id>."); process.exit(1); }
const ACTOR = "script:publish-policies";

const projectId = initFirebaseAdmin();
const db = getFirestore();
db.settings({ preferRest: true, ignoreUndefinedProperties: true });

const all = (await db.collection("policies").get()).docs;
const targets = all.filter((d) => (IDS ? IDS.includes(d.id) : d.get("status") === "draft"));
console.log(`=== Publish policies (${APPLY ? "APPLY" : "dry run"}) - project ${projectId} ===`);
if (IDS) for (const id of IDS) if (!all.some((d) => d.id === id)) console.log(`  not found: ${id}`);

let published = 0;
for (const d of targets) {
  const p = d.data();
  if (p.status !== "draft") { console.log(`  skip ${d.id} (status ${p.status})`); continue; }
  console.log(`  ${APPLY ? "publish" : "would publish"} ${d.id.padEnd(18)} ${p.policyKey} v${p.version}  ${p.titleEn ?? ""}`);
  if (!APPLY) { published++; continue; }
  await db.runTransaction(async (tx) => {
    const now = new Date().toISOString();
    const cur = (await tx.get(d.ref)).data();
    if (!cur || cur.status !== "draft") return;
    const others = await tx.get(db.collection("policies").where("policyKey", "==", cur.policyKey).where("status", "==", "published"));
    tx.set(d.ref, { ...cur, status: "published", isDemoDraft: false, approvedByUid: ACTOR, approvedAt: now, effectiveAt: now });
    for (const o of others.docs) if (o.id !== d.id) tx.set(o.ref, { status: "retired" }, { merge: true });
    const eventId = `aud_${now.replace(/[-:.TZ]/g, "")}_${randomUUID().slice(0, 8)}`;
    tx.set(db.collection("auditEvents").doc(eventId), {
      id: eventId, actorUid: ACTOR, action: "policy.publish", entityType: "policy", entityId: d.id,
      occurredAt: now, requestId: null, reason: NOTE, summary: { policyKey: cur.policyKey, version: cur.version },
    });
  });
  published++;
}
console.log(`\n${APPLY ? "Published" : "Would publish"}: ${published}${APPLY ? "" : "\nDry run only. Add --apply to write."}`);
