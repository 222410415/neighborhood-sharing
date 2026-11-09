/**
 * Account status check used by the auth guards (D-42).
 *
 * A suspended member is refused on every protected route. "Active" answers
 * are cached for a short time per API instance to avoid a database read on
 * every request; "suspended" answers are never cached, so lifting a
 * suspension takes effect at once. Suspending clears this instance's entry;
 * another instance notices within ACTIVE_CACHE_MS.
 */

/** The users collection (COLLECTIONS.users); passed in so this file has no Nest imports. */
export interface UsersCollection {
  doc(uid: string): { get(): Promise<{ exists: boolean; data(): unknown }> };
}

const ACTIVE_CACHE_MS = 30_000;
const MAX_ENTRIES = 10_000;
const activeUntil = new Map<string, number>();

export async function isSuspended(users: UsersCollection, uid: string): Promise<boolean> {
  const until = activeUntil.get(uid);
  if (until && until > Date.now()) return false;
  const snap = await users.doc(uid).get();
  const suspended = snap.exists && (snap.data() as { accountStatus?: string }).accountStatus === "suspended";
  if (!suspended) {
    if (activeUntil.size > MAX_ENTRIES) activeUntil.clear();
    activeUntil.set(uid, Date.now() + ACTIVE_CACHE_MS);
  }
  return suspended;
}

export function forgetAccountStatus(uid: string): void {
  activeUntil.delete(uid);
}

export const SUSPENDED_MESSAGE =
  "This account is suspended by a reviewer. Contact the team if you think this is a mistake.";
