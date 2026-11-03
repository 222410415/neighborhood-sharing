/**
 * Policies — versioned, bilingual. Imported from the dataset as demonstration
 * drafts (isDemoDraft: true). Only the team's approval, recorded by an admin
 * through POST /admin/policies/:id/publish, makes a version published; the
 * previously published version of the same key is retired. Every answer and
 * page built on a draft says so.
 */

import { Injectable } from "@nestjs/common";
import type { PolicyDto, PolicySummaryDto } from "@neighborhood/contracts";
import type { Firestore } from "firebase-admin/firestore";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import { ConflictException, NotFoundException } from "../../common/errors/api-exceptions.js";
import { WriteBuffer } from "../exchange/write-buffer.js";
import { AuditService } from "../roles/audit.service.js";
import type { PolicyChunk } from "./policy-retrieval.js";

export interface PolicyDoc extends PolicyDto {
  approvedByUid: string | null;
}

export interface PolicyChunkDoc extends PolicyChunk {
  version: string;
  topic: string;
  sequence: number;
  tokens: string[];
}

const CACHE_MS = 60_000;

/** The version in force for each key: the newest published one, else the newest draft. */
export function currentVersions(policies: PolicyDoc[]): PolicyDoc[] {
  const byKey = new Map<string, PolicyDoc>();
  const rank = (p: PolicyDoc) => (p.status === "published" ? 2 : p.status === "draft" ? 1 : 0);
  for (const p of policies) {
    if (p.status === "retired") continue;
    const current = byKey.get(p.policyKey);
    if (
      !current ||
      rank(p) > rank(current) ||
      (rank(p) === rank(current) && (p.effectiveAt ?? "") > (current.effectiveAt ?? ""))
    ) {
      byKey.set(p.policyKey, p);
    }
  }
  return [...byKey.values()].sort((a, b) => a.policyKey.localeCompare(b.policyKey));
}

/** Policy version ids in force now (stored on each new booking). */
export async function currentPolicyVersionIds(db: Firestore): Promise<string[]> {
  const snap = await db.collection(COLLECTIONS.policies).get();
  return currentVersions(snap.docs.map((d) => d.data() as PolicyDoc)).map((p) => p.id);
}

function summary(p: PolicyDoc): PolicySummaryDto {
  return {
    id: p.id,
    policyKey: p.policyKey,
    version: p.version,
    titleEn: p.titleEn,
    titleAr: p.titleAr,
    status: p.status,
    isDemoDraft: p.isDemoDraft,
    approvedAt: p.approvedAt,
    effectiveAt: p.effectiveAt,
  };
}

@Injectable()
export class PolicyService {
  private cache: { at: number; policies: PolicyDoc[]; chunks: PolicyChunkDoc[] } | null = null;

  constructor(
    private readonly firebase: FirebaseService,
    private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.firebase.firestore;
  }

  async all(): Promise<{ policies: PolicyDoc[]; chunks: PolicyChunkDoc[] }> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache;
    const [p, c] = await Promise.all([
      this.db.collection(COLLECTIONS.policies).get(),
      this.db.collection(COLLECTIONS.policyChunks).get(),
    ]);
    this.cache = {
      at: Date.now(),
      policies: p.docs.map((d) => d.data() as PolicyDoc),
      chunks: c.docs.map((d) => d.data() as PolicyChunkDoc),
    };
    return this.cache;
  }

  async list(): Promise<PolicySummaryDto[]> {
    return currentVersions((await this.all()).policies).map(summary);
  }

  async get(key: string): Promise<PolicyDto> {
    const current = currentVersions((await this.all()).policies).find((p) => p.policyKey === key || p.id === key);
    if (!current) throw new NotFoundException("Policy not found");
    const { approvedByUid: _a, ...dto } = current;
    return dto;
  }

  /** Admin records the team's approval of a version (plan gate G3). */
  async publish(adminUid: string, id: string, requestId: string | null): Promise<PolicyDto> {
    const ref = this.db.collection(COLLECTIONS.policies).doc(id);
    const published = await this.db.runTransaction(async (tx) => {
      const now = new Date().toISOString();
      const policy = (await tx.get(ref)).data() as PolicyDoc | undefined;
      if (!policy) throw new NotFoundException("Policy not found");
      if (policy.status === "published") return policy;
      if (policy.status === "retired") throw new ConflictException("A retired version cannot be published again.");
      const others = await tx.get(
        this.db.collection(COLLECTIONS.policies).where("policyKey", "==", policy.policyKey).where("status", "==", "published"),
      );
      const updated: PolicyDoc = {
        ...policy,
        status: "published",
        isDemoDraft: false,
        approvedByUid: adminUid,
        approvedAt: now,
        effectiveAt: now,
      };
      const buffer = new WriteBuffer();
      buffer.set(ref, updated);
      for (const doc of others.docs) {
        if (doc.id !== id) buffer.set(doc.ref, { status: "retired" }, { merge: true });
      }
      this.audit.inBuffer(buffer, this.db, {
        actorUid: adminUid,
        action: "policy.publish",
        entityType: "policy",
        entityId: id,
        requestId,
        summary: { policyKey: policy.policyKey, version: policy.version },
      }, now);
      buffer.flush(tx);
      return updated;
    });
    this.cache = null;
    const { approvedByUid: _a, ...dto } = published;
    return dto;
  }
}
