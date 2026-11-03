#!/usr/bin/env node
/**
 * Demo data seed: reference data, 3 demo members (Auth + profiles), 48 listings
 * and 48 images, from seed-data/. Idempotent.
 *
 * Usage:
 *   docker compose run --rm tools npx tsx scripts/seed/demo-data.ts
 *   or, with gcloud ADC: FIREBASE_PROJECT_ID=<id> npx tsx scripts/seed/demo-data.ts
 *
 * Credentials: GOOGLE_APPLICATION_CREDENTIALS (key file) or Application Default Credentials.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, join, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Firebase Admin
// firebase-admin is a dependency of the API workspace package, so resolve it
// from there (pnpm does not expose it at the repository root).
import { createRequire } from "node:module";
const requireFromApi = createRequire(resolve(__dirname, "..", "..", "apps", "api", "package.json"));
const { initializeApp, cert } = requireFromApi("firebase-admin/app");
const { getFirestore } = requireFromApi("firebase-admin/firestore");
const { getAuth } = requireFromApi("firebase-admin/auth");

const DATA_DIR = resolve(__dirname, "..", "..", "seed-data");
const COLLECTIONS_DIR = join(DATA_DIR, "collections");
const ASSETS_DIR = join(DATA_DIR, "assets");

const PROJECT_ID =
  process.env["FIREBASE_PROJECT_ID"] ?? "neighborhood-sharing";
const SA_PATH = process.env["GOOGLE_APPLICATION_CREDENTIALS"];

// Key file when given (tools container), otherwise Application Default
// Credentials (`gcloud auth application-default login`). Key contents are never printed.
if (SA_PATH && existsSync(resolve(SA_PATH))) {
  const sa = JSON.parse(readFileSync(resolve(SA_PATH), "utf-8"));
  initializeApp({ projectId: sa.project_id ?? PROJECT_ID, credential: cert(sa) });
} else {
  initializeApp({ projectId: PROJECT_ID });
}

const db = getFirestore();
const auth = getAuth();

db.settings({ preferRest: true, ignoreUndefinedProperties: true });

// ─── Helpers ───

function readCollection<T>(name: string): T[] {
  return JSON.parse(readFileSync(join(COLLECTIONS_DIR, `${name}.json`), "utf-8")) as T[];
}

function snakeToCamel(key: string): string {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function translateRecord(record: Record<string, unknown>, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[snakeToCamel(key)] = value;
  }
  return { ...result, ...overrides };
}

function normalizeToken(text: string): string {
  return text.toLowerCase().trim().replace(/[\u064B-\u0652\u0670\u0640]/g, "").replace(/\s+/g, " ").trim();
}

function deriveSearchTokens(titleEn: string, titleAr?: string): string[] {
  const tokens: string[] = [];
  const seen = new Set<string>();
  const add = (t: string) => {
    const n = normalizeToken(t);
    if (n && !seen.has(n) && tokens.length < 96) { seen.add(n); tokens.push(n); }
  };
  if (titleEn) add(titleEn);
  if (titleAr) add(titleAr);
  if (titleEn) for (const w of titleEn.split(/\s+/)) add(w);
  if (titleAr) for (const w of titleAr.split(/\s+/)) add(w);
  if (titleEn) {
    const words = titleEn.split(/\s+/);
    for (let len = 2; len <= 3 && len <= words.length; len++) {
      for (let i = 0; i <= words.length - len; i++) add(words.slice(i, i + len).join(" "));
    }
  }
  return tokens;
}

async function writeDoc(collection: string, id: string, data: Record<string, unknown>): Promise<void> {
  await db.collection(collection).doc(id).set(data, { merge: true });
}

async function countDocs(collection: string): Promise<number> {
  const snap = await db.collection(collection).count().get();
  return snap.data().count;
}

// ─── SVG rasterization ───

async function rasterizeSvg(svgPath: string): Promise<Buffer> {
  const resolved = resolve(svgPath);
  const rel = relative(ASSETS_DIR, resolved);
  if (rel.startsWith("..") || rel.startsWith(sep)) {
    throw new Error(`Source path outside assets directory: ${svgPath}`);
  }
  const sharp = (await import("sharp")).default;
  const svgBuffer = readFileSync(resolved);
  return sharp(svgBuffer).resize(800, 600, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
}

/** Reads an openly licensed photo (JPEG or PNG) from the assets directory. */
async function readPhoto(photoPath: string): Promise<Buffer> {
  const resolved = resolve(photoPath);
  const rel = relative(ASSETS_DIR, resolved);
  if (rel.startsWith("..") || rel.startsWith(sep)) {
    throw new Error(`Source path outside assets directory: ${photoPath}`);
  }
  const sharp = (await import("sharp")).default;
  // Normalise orientation and strip metadata before the usual main/thumbnail processing.
  return sharp(readFileSync(resolved)).rotate().png().toBuffer();
}

async function processToBase64(pngBuffer: Buffer) {
  const sharp = (await import("sharp")).default;
  // Step the quality down until the Base64 copy fits comfortably in a Firestore document.
  let mainBuf = Buffer.alloc(0);
  for (const quality of [80, 72, 64, 56]) {
    mainBuf = await sharp(pngBuffer).resize(1600, 1200, { fit: "inside", withoutEnlargement: true }).jpeg({ quality }).toBuffer();
    if ((mainBuf.length * 4) / 3 < 700_000) break;
  }
  const thumbBuf = await sharp(pngBuffer).resize(480, 360, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 75 }).toBuffer();
  const meta = await sharp(mainBuf).metadata();
  return {
    mainBase64: mainBuf.toString("base64"),
    thumbnailBase64: thumbBuf.toString("base64"),
    mimeType: "image/jpeg",
    widthPx: meta.width ?? 800,
    heightPx: meta.height ?? 600,
  };
}

// ─── Auth user creation (cloud) ───

const SEED_PASSWORD = process.env["SEED_USER_PASSWORD"] ?? "DemoPass123!";
const UID_MAP: Record<string, string> = {};

async function createAuthUser(email: string, password: string, displayName: string, desiredUid: string): Promise<void> {
  try {
    // Try to get existing user
    const existing = await auth.getUserByEmail(email);
    UID_MAP[desiredUid] = existing.uid;
    console.log(`  [auth] ${email} already exists (UID: ${existing.uid})`);
    return;
  } catch {
    // User doesn't exist — create
  }

  try {
    const created = await auth.createUser({
      email,
      password,
      displayName,
      uid: desiredUid,
    });
    UID_MAP[desiredUid] = created.uid;
    console.log(`  [auth] ${email} created (UID: ${created.uid})`);
  } catch (err: any) {
    if (err.code === "auth/uid-already-exists" || err.code === "auth/email-already-exists") {
      const existing = await auth.getUserByEmail(email);
      UID_MAP[desiredUid] = existing.uid;
      console.log(`  [auth] ${email} already exists (UID: ${existing.uid})`);
    } else {
      console.error(`  [auth] Failed to create ${email}: ${err.message}`);
    }
  }
}

// ─── Main ───

async function main() {
  console.log("=== Neighborhood Sharing — Cloud Seed ===");
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Service account: ${SA_PATH}`);
  console.log("");

  // Reference data
  console.log("── Reference data ──");
  for (const name of ["regions", "cities", "neighborhoods", "categories"]) {
    const records = readCollection(name);
    for (const r of records) {
      await writeDoc(name, r["id"], translateRecord(r));
    }
    console.log(`  ${name}: ${records.length}`);
  }

  // Auth users + profiles
  console.log("\n── Auth users + profiles ──");
  const users = readCollection<Record<string, unknown>>("users");
  for (const user of users) {
    const sourceId = user["id"] as string;
    const email = user["email"] as string;
    const displayName = user["display_name"] as string;

    await createAuthUser(email, SEED_PASSWORD, displayName, sourceId);

    const mappedUid = UID_MAP[sourceId] ?? sourceId;
    const profileData = translateRecord(user, {
      uid: mappedUid,
      sourceId,
      completedProfile: true,
      roles: undefined,
    });
    delete profileData["roles"];
    await writeDoc("users", mappedUid, profileData);
    console.log(`  profile: ${displayName} (${mappedUid})`);
  }

  // Listings + media
  console.log("\n── Listings + media ──");
  const listings = readCollection<Record<string, unknown>>("listings");
  const assets = readCollection<Record<string, unknown>>("assets");
  const assetMap = new Map(assets.map((a) => [a["id"] as string, a]));

  let mediaCount = 0;
  let listingCount = 0;

  for (const listing of listings) {
    const listingId = listing["id"] as string;
    const sourceOwnerId = listing["owner_id"] as string;
    const mappedOwnerId = UID_MAP[sourceOwnerId] ?? sourceOwnerId;
    const primaryAssetId = listing["primary_asset_id"] as string;
    const titleEn = listing["title_en"] as string;
    const titleAr = listing["title_ar"] as string | undefined;

    const searchTokens = deriveSearchTokens(titleEn, titleAr);

    const listingData = translateRecord(listing, {
      ownerUid: mappedOwnerId,
      sourceOwnerId,
      searchTokens,
      revision: 0,
      primaryMediaId: null,
      mediaIds: [],
      searchTerms: undefined,
      ownerId: undefined,
      primaryAssetId: undefined,
    });
    delete listingData["searchTerms"];
    delete listingData["ownerId"];
    delete listingData["primaryAssetId"];

    await writeDoc("listings", listingId, listingData);
    listingCount++;

    // Rasterize and import media
    if (primaryAssetId && assetMap.has(primaryAssetId)) {
      const asset = assetMap.get(primaryAssetId)!;
      const assetPath = asset["path"] as string;
      const filename = assetPath.replace(/^assets\//, "");
      const sourcePath = join(ASSETS_DIR, filename);
      const isPhoto = /\.(jpe?g|png)$/i.test(filename);

      if (existsSync(sourcePath)) {
        try {
          const pngBuf = isPhoto ? await readPhoto(sourcePath) : await rasterizeSvg(sourcePath);
          const processed = await processToBase64(pngBuf);
          // Photos use a new id so the web app shows them (media_itm_* ids are
          // treated as text placeholders and hidden).
          const mediaId = isPhoto ? `media_photo_${listingId}` : `media_${listingId}`;
          const checksum = createHash("sha256").update(pngBuf).digest("hex");
          const credit = isPhoto ? (asset["credit"] as Record<string, unknown> | undefined) : undefined;

          await writeDoc("media", mediaId, {
            id: mediaId,
            ownerUid: mappedOwnerId,
            listingId,
            uploadState: "attached",
            purpose: "listing",
            parentType: "listing",
            parentId: listingId,
            mimeType: processed.mimeType,
            widthPx: processed.widthPx,
            heightPx: processed.heightPx,
            mainSizeBytes: Buffer.byteLength(processed.mainBase64, "base64"),
            thumbnailSizeBytes: Buffer.byteLength(processed.thumbnailBase64, "base64"),
            checksum,
            mainBase64: processed.mainBase64,
            thumbnailBase64: processed.thumbnailBase64,
            clientSubmissionId: null,
            createdAt: new Date().toISOString(),
            expiresAt: null,
            isDemo: true,
            ...(credit
              ? {
                  credit: {
                    creator: credit["creator"] ?? "Unknown",
                    license: credit["license"] ?? "",
                    licenseUrl: credit["license_url"] ?? null,
                    sourceUrl: credit["source_url"] ?? null,
                    title: credit["title"] ?? null,
                  },
                }
              : {}),
          });
          mediaCount++;

          listingData["primaryMediaId"] = mediaId;
          listingData["mediaIds"] = [mediaId];
          await writeDoc("listings", listingId, listingData);
          // Remove the replaced text placeholder, if an earlier seed created it.
          if (isPhoto) await db.collection("media").doc(`media_${listingId}`).delete();
        } catch (err) {
          console.error(`  [media] Failed: ${filename}: ${(err as Error).message}`);
        }
      }
    }
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`  listings: ${listingCount}`);
  console.log(`  media: ${mediaCount}`);

  // Verification
  console.log("\n── Verification ──");
  for (const [name, expected] of [
    ["regions", 13], ["cities", 17], ["neighborhoods", 12],
    ["categories", 8], ["listings", 48], ["media", 48], ["users", 3],
  ]) {
    const count = await countDocs(name);
    console.log(`  ${count === expected ? "PASS" : "FAIL"} ${name}: ${count} (expected ${expected})`);
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
