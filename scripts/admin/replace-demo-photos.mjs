#!/usr/bin/env node
/**
 * Replaces the text placeholder images of the seeded demo listings with the
 * openly licensed photos in seed-data/assets/photos/, without
 * re-running the full demo seed (which would rewrite the listings).
 *
 * For each listing whose asset has a photo and credit:
 *   - writes media/media_photo_<listingId> (main 1600x1200 + thumbnail, credit)
 *   - points the listing at it (primaryMediaId, mediaIds; revision + 1)
 *   - deletes the placeholder media/media_<listingId>
 * Member-uploaded photos on a listing are kept. Idempotent.
 *
 * DRY RUN BY DEFAULT. Apply with --apply.
 *   Docker: docker compose run --rm tools node scripts/admin/replace-demo-photos.mjs [--apply]
 *   Mac:    GOOGLE_APPLICATION_CREDENTIALS=/path/key.json node scripts/admin/replace-demo-photos.mjs [--apply]
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { initFirebaseAdmin } from "../lib/firebase-admin.mjs";

const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const { getFirestore } = require("firebase-admin/firestore");
const sharp = createRequire(new URL("../../package.json", import.meta.url))("sharp");

const APPLY = process.argv.includes("--apply");
const DATA = new URL("../../seed-data/", import.meta.url);
const MAX_DOC_BYTES = 900_000; // Firestore limit is 1 MiB per document

const projectId = initFirebaseAdmin();
const db = getFirestore();
db.settings({ preferRest: true, ignoreUndefinedProperties: true });

const listings = JSON.parse(readFileSync(new URL("collections/listings.json", DATA), "utf-8"));
const assets = new Map(JSON.parse(readFileSync(new URL("collections/assets.json", DATA), "utf-8")).map((a) => [a.id, a]));

console.log(`=== Replace demo photos (${APPLY ? "APPLY" : "dry run"}) - project ${projectId} ===`);
let done = 0, skipped = 0;
for (const l of listings) {
  const asset = assets.get(l.primary_asset_id);
  if (!asset?.credit || !/\.jpe?g$/i.test(asset.path)) { console.log(`  keep placeholder  ${l.id} (no photo)`); skipped++; continue; }
  const file = new URL(asset.path, DATA);
  if (!existsSync(file)) { console.log(`  MISSING FILE      ${asset.path}`); skipped++; continue; }

  const ref = db.collection("listings").doc(l.id);
  const snap = await ref.get();
  if (!snap.exists) { console.log(`  no listing        ${l.id}`); skipped++; continue; }
  const listing = snap.data();

  const src = await sharp(readFileSync(file)).rotate().png().toBuffer();
  // Step the quality down until the document fits Firestore's 1 MiB limit.
  let main;
  for (const quality of [80, 72, 64, 56]) {
    main = await sharp(src).resize(1600, 1200, { fit: "inside", withoutEnlargement: true }).jpeg({ quality }).toBuffer();
    if (main.length * 4 / 3 < 700_000) break;
  }
  const thumb = await sharp(src).resize(480, 360, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
  const meta = await sharp(main).metadata();
  const tmeta = await sharp(thumb).metadata();
  const mainB64 = main.toString("base64"), thumbB64 = thumb.toString("base64");
  const docBytes = mainB64.length + thumbB64.length + 2000;
  if (docBytes > MAX_DOC_BYTES) { console.log(`  TOO LARGE         ${l.id} (${docBytes} bytes)`); skipped++; continue; }

  const mediaId = `media_photo_${l.id}`;
  const placeholderId = `media_${l.id}`;
  const oldIds = Array.isArray(listing.mediaIds) ? listing.mediaIds : [];
  const mediaIds = [mediaId, ...oldIds.filter((id) => id !== placeholderId && id !== mediaId)];
  const primaryMediaId = !listing.primaryMediaId || listing.primaryMediaId === placeholderId ? mediaId : listing.primaryMediaId;
  const placeholderExists = (await db.collection("media").doc(placeholderId).get()).exists;
  console.log(`  ${APPLY ? "replace" : "would replace"}  ${l.id.padEnd(28)} ${String(Math.round(docBytes / 1024)).padStart(4)} KB  placeholder ${placeholderExists ? "deleted" : "absent"}  ${asset.credit.license}`);
  if (!APPLY) { done++; continue; }

  const now = new Date().toISOString();
  await db.collection("media").doc(mediaId).set({
    id: mediaId, ownerUid: listing.ownerUid, listingId: l.id, uploadState: "attached",
    purpose: "listing", parentType: "listing", parentId: l.id,
    mimeType: "image/jpeg", widthPx: meta.width, heightPx: meta.height,
    thumbnailWidthPx: tmeta.width, thumbnailHeightPx: tmeta.height,
    mainSizeBytes: main.length, thumbnailSizeBytes: thumb.length,
    checksum: createHash("sha256").update(main).digest("hex"),
    mainBase64: mainB64, thumbnailBase64: thumbB64,
    clientSubmissionId: null, createdAt: now, expiresAt: null, isDemo: true,
    credit: {
      creator: asset.credit.creator, license: asset.credit.license,
      licenseUrl: asset.credit.license_url ?? null, sourceUrl: asset.credit.source_url ?? null,
      title: asset.credit.title ?? null,
    },
  });
  await db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data();
    tx.update(ref, { mediaIds, primaryMediaId, revision: (cur?.revision ?? 0) + 1, updatedAt: now });
  });
  if (placeholderExists) await db.collection("media").doc(placeholderId).delete();
  done++;
}
console.log(`\n${APPLY ? "Replaced" : "Would replace"}: ${done}; skipped: ${skipped}${APPLY ? "" : "\nDry run only. Run again with --apply to write."}`);
