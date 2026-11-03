/**
 * Collects the writes of one Firestore transaction and applies them together
 * at the end. Firestore requires every read in a transaction to happen before
 * any write; buffering lets command code read and decide freely, and
 * coalesces repeated writes to the same document into one.
 */

import type { DocumentReference, Transaction } from "firebase-admin/firestore";

interface PendingWrite {
  ref: DocumentReference;
  data: Record<string, unknown>;
  merge: boolean;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(source)) {
    const existing = out[key];
    out[key] = isPlainObject(existing) && isPlainObject(value) ? deepMerge(existing, value) : value;
  }
  return out;
}

export class WriteBuffer {
  private readonly writes = new Map<string, PendingWrite>();

  /** Replace the whole document (or merge fields when `merge` is true). */
  set(ref: DocumentReference, data: object, options: { merge?: boolean } = {}): void {
    const incoming = data as Record<string, unknown>;
    const merge = options.merge ?? false;
    const existing = this.writes.get(ref.path);
    if (!existing || !merge) {
      this.writes.set(ref.path, { ref, data: { ...incoming }, merge });
      return;
    }
    existing.data = deepMerge(existing.data, incoming);
  }

  get size(): number {
    return this.writes.size;
  }

  flush(tx: Transaction): void {
    for (const write of this.writes.values()) {
      if (write.merge) {
        tx.set(write.ref, write.data, { merge: true });
      } else {
        tx.set(write.ref, write.data);
      }
    }
    this.writes.clear();
  }
}
