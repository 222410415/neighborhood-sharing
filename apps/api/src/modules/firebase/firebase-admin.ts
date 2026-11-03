import { initializeApp, getApps, getApp, cert } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";
import { generateKeyPairSync } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export interface FirebaseAdminInstance {
  firestore: Firestore;
  auth: Auth;
  projectId: string;
}

/** Service account key JSON from a secret environment variable, if set. */
function serviceAccountFromEnv(): Record<string, unknown> | null {
  const b64 = process.env["FIREBASE_SERVICE_ACCOUNT_BASE64"];
  const raw = b64 ? Buffer.from(b64, "base64").toString("utf-8") : process.env["FIREBASE_SERVICE_ACCOUNT_JSON"];
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error(
      "The Firebase service account secret is not valid JSON " +
        "(check FIREBASE_SERVICE_ACCOUNT_BASE64 / FIREBASE_SERVICE_ACCOUNT_JSON).",
    );
  }
}

/**
 * Initialize Firebase Admin SDK.
 *
 * Two modes:
 * 1. Emulator mode — when FIRESTORE_EMULATOR_HOST or FIREBASE_AUTH_EMULATOR_HOST is set.
 *    Uses dummy credentials; no real service account needed.
 * 2. Cloud mode — when no emulator host is set. Credentials, in order:
 *    a. FIREBASE_SERVICE_ACCOUNT_BASE64 — the key JSON, Base64-encoded (secret env var on the host)
 *    b. FIREBASE_SERVICE_ACCOUNT_JSON — the key JSON as plain text (secret env var on the host)
 *    c. GOOGLE_APPLICATION_CREDENTIALS — path to the key file (for example a mounted secret file)
 *    d. Application Default Credentials from `gcloud auth application-default login`
 *    Key contents are never logged.
 */
export function initializeFirebaseAdmin(): FirebaseAdminInstance {
  const projectId =
    process.env["FIREBASE_PROJECT_ID"] ??
    process.env["GCLOUD_PROJECT"] ??
    "neighborhood-sharing";

  const firestoreEmulatorHost = process.env["FIRESTORE_EMULATOR_HOST"];
  const authEmulatorHost = process.env["FIREBASE_AUTH_EMULATOR_HOST"];
  const isEmulator = !!firestoreEmulatorHost || !!authEmulatorHost;
  const isProduction = process.env["NODE_ENV"] === "production";

  // Guard: reject emulator settings in production
  if (isProduction && isEmulator) {
    throw new Error(
      "Emulator environment variables detected in production. " +
        "Refusing to start with FIRESTORE_EMULATOR_HOST or " +
        "FIREBASE_AUTH_EMULATOR_HOST set when NODE_ENV=production.",
    );
  }

  process.env["GCLOUD_PROJECT"] = projectId;

  if (getApps().length === 0) {
    if (isEmulator) {
      const { privateKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
        publicKeyEncoding: { type: "spki", format: "pem" },
      });
      initializeApp({
        projectId,
        credential: cert({
          projectId,
          clientEmail: `demo@${projectId}.iam.gserviceaccount.com`,
          privateKey,
        }),
      });
    } else {
      // Cloud mode — secret env var, then service account file, then ADC
      const saPath =
        process.env["GOOGLE_APPLICATION_CREDENTIALS"];
      const saFromEnv = serviceAccountFromEnv();

      if (saFromEnv) {
        initializeApp({
          projectId: (saFromEnv["project_id"] as string | undefined) ?? projectId,
          credential: cert(saFromEnv as Parameters<typeof cert>[0]),
        });
      } else if (saPath && existsSync(resolve(saPath))) {
        // Use the provided service account key
        const saContent = readFileSync(resolve(saPath), "utf-8");
        const sa = JSON.parse(saContent);
        initializeApp({
          projectId: sa.project_id ?? projectId,
          credential: cert(sa),
        });
      } else {
        // Fall back to Application Default Credentials (gcloud auth)
        initializeApp({ projectId });
      }
    }
  }

  const firestore = getFirestore(getApp());
  const auth = getAuth(getApp());

  firestore.settings({
    preferRest: true,
    ignoreUndefinedProperties: true,
  });

  return { firestore, auth, projectId };
}
