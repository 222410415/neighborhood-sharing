#!/usr/bin/env node
/**
 * Grant or revoke the admin role for a demo persona (D-43: one privileged role;
 * an older stored "reviewer" is read as admin and replaced on the next grant).
 *
 * Refuses any email that is not a fictional demo address (@neighborhood-demo.test),
 * so a real person's account is never given administrative power by script.
 * Writes roleAssignments/{uid} and an audit event.
 *
 * Docker (tools container, real project; key from FIREBASE_KEY_FILE in .env):
 *   docker compose run --rm tools node scripts/admin/grant-role.mjs --email jawharah@neighborhood-demo.test --role admin
 * Revoke:  ... --revoke
 * Without Docker: GOOGLE_APPLICATION_CREDENTIALS=/path/key.json node scripts/admin/grant-role.mjs ...
 */

import { createRequire } from "node:module";
import { initFirebaseAdmin } from "../lib/firebase-admin.mjs";
import { randomUUID } from "node:crypto";

const require = createRequire(new URL("../../apps/api/package.json", import.meta.url));
const { getFirestore } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const email = (arg("email") ?? "").trim().toLowerCase();
const role = arg("role") ?? "admin";
const revoke = args.includes("--revoke");

if (!/^[a-z0-9._-]+@neighborhood-demo\.test$/.test(email)) {
  console.error("Refusing: only fictional demo accounts (@neighborhood-demo.test) can be given roles by script.");
  process.exit(1);
}
if (role !== "admin") {
  console.error("--role must be admin (the reviewer role was merged into admin, D-43)");
  process.exit(1);
}

initFirebaseAdmin();

const db = getFirestore();
db.settings({ preferRest: true, ignoreUndefinedProperties: true });

const user = await getAuth().getUserByEmail(email).catch(() => null);
if (!user) {
  console.error(`No account found for ${email}. Seed the demo members first.`);
  process.exit(1);
}

const now = new Date().toISOString();
const ref = db.collection("roleAssignments").doc(user.uid);
const current = (await ref.get()).data();
const roles = new Set((current && !current.revokedAt ? current.roles : []) ?? []);
roles.delete("reviewer"); // pre-D-43 name of the same role
if (revoke) roles.delete(role);
else roles.add(role);

await ref.set({
  uid: user.uid,
  roles: [...roles],
  grantedByUid: "script:grant-role",
  grantedAt: now,
  revokedAt: roles.size === 0 ? now : null,
  revision: (current?.revision ?? 0) + 1,
});
const eventId = `aud_${now.replace(/[-:.TZ]/g, "")}_${randomUUID().slice(0, 8)}`;
await db.collection("auditEvents").doc(eventId).set({
  id: eventId,
  actorUid: "script:grant-role",
  action: revoke ? "role.revoke" : "role.grant",
  entityType: "roleAssignment",
  entityId: user.uid,
  occurredAt: now,
  requestId: null,
  reason: null,
  summary: { role },
});
console.log(`${revoke ? "Revoked" : "Granted"} ${role} for ${email} (uid ${user.uid}). Roles now: member${roles.size ? ", " + [...roles].join(", ") : ""}.`);
