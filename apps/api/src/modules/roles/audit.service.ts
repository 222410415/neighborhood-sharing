/**
 * AuditService — one audit event per privileged write and per reviewer read
 * of private evidence. Events hold identifiers, an action and a short bounded
 * summary; never message text, addresses or image data.
 */

import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { AuditEventDto } from "@neighborhood/contracts";
import { FirebaseService } from "../firebase/firebase.service.js";
import { COLLECTIONS } from "../../common/repositories/base.repository.js";
import type { WriteBuffer } from "../exchange/write-buffer.js";

export interface AuditInput {
  actorUid: string;
  action: string;
  entityType: string;
  entityId: string;
  requestId?: string | null;
  reason?: string | null;
  summary?: Record<string, string | number | boolean | null>;
}

const MAX_SUMMARY_KEYS = 10;
const MAX_TEXT = 120;

function bounded(summary: AuditInput["summary"]): AuditEventDto["summary"] {
  const out: AuditEventDto["summary"] = {};
  for (const [key, value] of Object.entries(summary ?? {}).slice(0, MAX_SUMMARY_KEYS)) {
    out[key.slice(0, 40)] = typeof value === "string" ? value.slice(0, MAX_TEXT) : value;
  }
  return out;
}

export function buildAuditEvent(input: AuditInput, now: string): AuditEventDto {
  return {
    id: `aud_${now.replace(/[-:.TZ]/g, "")}_${randomUUID().slice(0, 8)}`,
    actorUid: input.actorUid,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    occurredAt: now,
    requestId: input.requestId ?? null,
    reason: input.reason ? input.reason.slice(0, 300) : null,
    summary: bounded(input.summary),
  };
}

@Injectable()
export class AuditService {
  constructor(private readonly firebase: FirebaseService) {}

  /** Write an audit event on its own (for example after an evidence read). */
  async record(input: AuditInput): Promise<AuditEventDto> {
    const event = buildAuditEvent(input, new Date().toISOString());
    await this.firebase.firestore.collection(COLLECTIONS.auditEvents).doc(event.id).set(event);
    return event;
  }

  /** Add an audit event to a transaction's write buffer, so it commits with the action. */
  inBuffer(buffer: WriteBuffer, db: Firestore, input: AuditInput, now: string): AuditEventDto {
    const event = buildAuditEvent(input, now);
    buffer.set(db.collection(COLLECTIONS.auditEvents).doc(event.id), event);
    return event;
  }

  async listFor(entityType: string, entityId: string): Promise<AuditEventDto[]> {
    const snap = await this.firebase.firestore
      .collection(COLLECTIONS.auditEvents)
      .where("entityType", "==", entityType)
      .where("entityId", "==", entityId)
      .get();
    return snap.docs
      .map((d) => d.data() as AuditEventDto)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }
}
