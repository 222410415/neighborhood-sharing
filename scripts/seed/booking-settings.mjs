#!/usr/bin/env node
/**
 * Booking settings seed: booking settings and a few owner unavailable periods on the
 * demonstration listings. Idempotent: listings that already have booking
 * settings are left alone, blocks use fixed ids, and only seeded demo listings
 * (isDemo: true) are touched, never member-created records.
 *
 * The Cordless Drill Kit is deliberately left without settings: in the
 * demonstration Leen sets its availability herself.
 *
 * Docker (tools container, real project; key from FIREBASE_KEY_FILE in .env):
 *   docker compose run --rm tools node scripts/seed/booking-settings.mjs
 * Without Docker: GOOGLE_APPLICATION_CREDENTIALS=/path/key.json node scripts/seed/booking-settings.mjs
 *
 * Real Firestore (on the Mac; the key stays local and is never printed):
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json FIREBASE_PROJECT_ID=<project> node scripts/seed/booking-settings.mjs
 */

import { createRequire } from "node:module";
import { initFirebaseAdmin } from "../lib/firebase-admin.mjs";

// firebase-admin is a dependency of the API workspace package.
const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const { getFirestore } = require("firebase-admin/firestore");

const DAY_MS = 24 * 60 * 60 * 1000;

const SKIP = new Set(["itm_cordless-drill"]);
const INSTANT = new Set(["itm_folding-ladder", "itm_camping-lantern", "itm_laser-level"]);
const BLOCKS = [
  { listingId: "itm_camping-tent", startDay: 5, days: 2, note: "Family trip (seeded demo)" },
  { listingId: "itm_laser-level", startDay: 10, days: 2, note: "Using it at home (seeded demo)" },
  { listingId: "itm_portable-projector", startDay: 14, days: 1, note: "Lent to a relative (seeded demo)" },
];

/** Start of the current day in Riyadh (UTC+03:00), as UTC ISO. */
function riyadhTodayStart() {
  const now = new Date(Date.now() + 3 * 60 * 60 * 1000);
  const day = now.toISOString().slice(0, 10);
  return new Date(`${day}T00:00:00+03:00`).getTime();
}

async function main() {
  const PROJECT_ID = initFirebaseAdmin();
  const db = getFirestore();
  db.settings({ preferRest: true, ignoreUndefinedProperties: true });

  console.log("=== Booking settings seed: settings and owner blocks ===");
  console.log(`Target: real Firestore (project ${PROJECT_ID})`);

  const today = riyadhTodayStart();
  const bookableFrom = new Date(today).toISOString();
  const bookableUntil = new Date(today + 90 * DAY_MS).toISOString();
  const nowIso = new Date().toISOString();

  const snap = await db.collection("listings").where("isDemo", "==", true).get();
  let configured = 0;
  let skipped = 0;
  for (const doc of snap.docs) {
    const listing = doc.data();
    if (listing.status !== "published" || SKIP.has(listing.id)) {
      skipped++;
      continue;
    }
    if (listing.bookingMode || listing.bookableFrom) {
      skipped++;
      continue;
    }
    await doc.ref.update({
      bookingMode: INSTANT.has(listing.id) ? "instant" : "approval",
      bookableFrom,
      bookableUntil,
      revision: (listing.revision ?? 0) + 1,
      updatedAt: nowIso,
    });
    configured++;
  }
  console.log(`  listings configured: ${configured}, left unchanged: ${skipped}`);

  let blocksAdded = 0;
  for (const spec of BLOCKS) {
    const listingSnap = await db.collection("listings").doc(spec.listingId).get();
    if (!listingSnap.exists || listingSnap.data().isDemo !== true) continue;
    const id = `blk_seed_${spec.listingId}`;
    const ref = db.collection("availabilityBlocks").doc(id);
    if ((await ref.get()).exists) continue;
    const startAt = new Date(today + spec.startDay * DAY_MS + 9 * 60 * 60 * 1000).toISOString();
    const endAt = new Date(today + (spec.startDay + spec.days) * DAY_MS + 9 * 60 * 60 * 1000).toISOString();
    const live = await db
      .collection("availabilityBlocks")
      .where("listingId", "==", spec.listingId)
      .where("status", "==", "live")
      .get();
    const overlaps = live.docs.some((d) => {
      const b = d.data();
      return b.kind === "reservation" && Date.parse(b.startAt) < Date.parse(endAt) && Date.parse(b.endAt) > Date.parse(startAt);
    });
    if (overlaps) {
      console.log(`  skipped block on ${spec.listingId}: overlaps a reservation`);
      continue;
    }
    await ref.set({
      id,
      listingId: spec.listingId,
      kind: "owner",
      startAt,
      endAt,
      status: "live",
      bookingId: null,
      holdExpiresAt: null,
      note: spec.note,
      createdByUid: listingSnap.data().ownerUid,
      createdAt: nowIso,
      releasedAt: null,
      clientRequestId: null,
      isDemo: true,
    });
    blocksAdded++;
  }
  console.log(`  owner blocks added: ${blocksAdded}`);

  await db.collection("seedManifests").doc("sprint2-v1").set(
    {
      version: "sprint2-v1",
      seededAt: nowIso,
      listingsConfigured: configured,
      blocksAdded,
      note: "Booking settings and owner blocks on demo listings; Cordless Drill Kit left for the live demonstration.",
    },
    { merge: true },
  );
  console.log("Done.");
}

main().catch((err) => {
  console.error("Booking settings seed failed:", err.message ?? err);
  process.exit(1);
});
