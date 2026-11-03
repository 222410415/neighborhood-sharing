#!/usr/bin/env node
/**
 * Removes test-created data so the demonstration starts clean.
 *
 * DRY RUN BY DEFAULT: it only lists what it would delete. Deleting needs both
 * --apply and --yes. Seeded demo data (isDemo listings, members, reference
 * data, policies) and the audit trail are never touched.
 *
 * Test data = listings created by the scripted checks (clientSubmissionId
 * starting fc-, fc2- or fc3-, or the leftover Weeks 10-11 test titles with
 * --include-legacy) and everything attached to them: bookings, events,
 * blocks, payments, deposits, private details, condition records, reviews,
 * disputes, conversations, messages, notifications, favorites, offers, media
 * and calendar guards; plus requests and reports the checks created (FC3 prefix).
 *
 * Options: --include-legacy (Weeks 10-11 leftover test titles), --include-demo-checks
 * (simulated phone/identity checks).
 *
 * Docker (tools container, real project): docker compose run --rm tools node scripts/admin/reset-demo-data.mjs [--apply --yes]
 * Without Docker: GOOGLE_APPLICATION_CREDENTIALS=/path/key.json node scripts/admin/reset-demo-data.mjs [--apply --yes]
 */

import { createRequire } from "node:module";
import { initFirebaseAdmin } from "../lib/firebase-admin.mjs";

const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const { getFirestore } = require("firebase-admin/firestore");

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply") && args.has("--yes");
const LEGACY = args.has("--include-legacy");
const DEMO_CHECKS = args.has("--include-demo-checks");
const PROJECT_ID = initFirebaseAdmin();
const TEST_PREFIXES = ["fc-", "fc2-", "fc3-"];
const LEGACY_TITLES = new Set(["Tile Cutter", "Tile Cutter (manual)", "Handheld Garment Steamer", "Taken over", "Stale edit"]);

const db = getFirestore();
db.settings({ preferRest: true, ignoreUndefinedProperties: true });

const plan = new Map(); // collection -> Set(ids)
const add = (collection, id) => {
  if (!plan.has(collection)) plan.set(collection, new Set());
  plan.get(collection).add(id);
};
const all = async (collection) => (await db.collection(collection).get()).docs.map((d) => d.data());
const where = async (collection, field, value) =>
  (await db.collection(collection).where(field, "==", value).get()).docs.map((d) => ({ id: d.id, ...d.data() }));

console.log(`=== Reset demo data (${APPLY ? "APPLY" : "dry run"}) ===`);
console.log(`Target: real Firestore (project ${PROJECT_ID})`);

// 1. Test listings
const listings = (await all("listings")).filter(
  (l) =>
    l.isDemo !== true &&
    ((typeof l.clientSubmissionId === "string" && TEST_PREFIXES.some((p) => l.clientSubmissionId.startsWith(p))) ||
      (LEGACY && LEGACY_TITLES.has(l.titleEn))),
);
const listingIds = new Set(listings.map((l) => l.id));
listings.forEach((l) => add("listings", l.id));

// 2. Bookings on test listings, and everything attached to them
const bookingIds = new Set();
for (const listingId of listingIds) {
  for (const b of await where("bookings", "listingId", listingId)) bookingIds.add(b.id);
  for (const blk of await where("availabilityBlocks", "listingId", listingId)) add("availabilityBlocks", blk.id);
  for (const m of await where("media", "listingId", listingId)) add("media", m.id);
  for (const f of await where("favorites", "listingId", listingId)) add("favorites", f.id);
  for (const o of await where("requestOffers", "listingId", listingId)) add("requestOffers", o.id);
  for (const c of await where("conversations", "contextId", listingId)) add("conversations", c.id);
  add("calendarControls", listingId);
}
for (const bookingId of bookingIds) {
  add("bookings", bookingId);
  add("bookingPrivateDetails", bookingId);
  add("deposits", bookingId);
  for (const col of ["bookingEvents", "payments", "conditionReports", "reviews", "disputes", "media"]) {
    for (const d of await where(col, "bookingId", bookingId)) add(col, d.id);
  }
  for (const c of await where("conversations", "contextId", bookingId)) add("conversations", c.id);
}

// 3. Requests and reports created by the checks
for (const r of await all("requestPosts")) {
  if (typeof r.title === "string" && r.title.startsWith("FC3")) {
    add("requestPosts", r.id);
    for (const o of await where("requestOffers", "requestPostId", r.id)) add("requestOffers", o.id);
  }
}
for (const r of await all("reports")) {
  if ((typeof r.clientRequestId === "string" && TEST_PREFIXES.some((p) => r.clientRequestId.startsWith(p))) ||
      (r.bookingId && bookingIds.has(r.bookingId)) || (r.targetId && listingIds.has(r.targetId))) {
    add("reports", r.id);
  }
}

// Optional: demonstration verification checks (phone/identity demo) of every member.
if (DEMO_CHECKS) {
  for (const c of await all("verificationChecks")) {
    if (c.isSimulated === true) add("verificationChecks", c.id);
  }
}

// 4. Messages in removed conversations, and notifications about removed things
const conversationIds = new Set(plan.get("conversations") ?? []);
for (const conversationId of conversationIds) {
  for (const m of await where("messages", "conversationId", conversationId)) add("messages", m.id);
}
const removedEntities = new Set([
  ...(plan.get("verificationChecks") ?? []),
  ...bookingIds,
  ...conversationIds,
  ...listingIds,
  ...(plan.get("disputes") ?? []),
  ...(plan.get("reports") ?? []),
  ...(plan.get("requestPosts") ?? []),
]);
for (const n of await all("notifications")) {
  if (removedEntities.has(n.entityId)) add("notifications", n.id);
}

// Report
let total = 0;
for (const [collection, idSet] of [...plan.entries()].sort()) {
  total += idSet.size;
  console.log(`  ${collection}: ${idSet.size}${idSet.size ? `  e.g. ${[...idSet].slice(0, 3).join(", ")}` : ""}`);
}
console.log(`Total documents: ${total}`);

if (!APPLY) {
  console.log("\nDry run only. Re-run with --apply --yes to delete these documents.");
  process.exit(0);
}

let deleted = 0;
for (const [collection, idSet] of plan) {
  const list = [...idSet];
  for (let i = 0; i < list.length; i += 400) {
    const batch = db.batch();
    for (const id of list.slice(i, i + 400)) batch.delete(db.collection(collection).doc(id));
    await batch.commit();
    deleted += Math.min(400, list.length - i);
  }
}
console.log(`Deleted ${deleted} documents. Seeded demo data, policies and the audit trail were not touched.`);
