/**
 * Shared Firebase Admin start-up for the seed and admin scripts.
 *
 * Credentials, in order:
 *  1. GOOGLE_APPLICATION_CREDENTIALS = path to a service-account key file
 *     (the tools container mounts FIREBASE_KEY_FILE from .env read-only);
 *  2. Application Default Credentials, e.g. after
 *     `gcloud auth application-default login` (no key file needed);
 *     FIREBASE_PROJECT_ID must then be set.
 * Key contents are never printed. Returns the project id.
 */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const { initializeApp, cert } = require("firebase-admin/app");

export function initFirebaseAdmin() {
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyPath && existsSync(resolve(keyPath))) {
    const sa = JSON.parse(readFileSync(resolve(keyPath), "utf-8"));
    const projectId = sa.project_id ?? process.env.FIREBASE_PROJECT_ID;
    initializeApp({ projectId, credential: cert(sa) });
    return projectId;
  }
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    console.error("Set GOOGLE_APPLICATION_CREDENTIALS (key file) or FIREBASE_PROJECT_ID with Application Default Credentials. Refusing to run.");
    process.exit(1);
  }
  initializeApp({ projectId });
  return projectId;
}
