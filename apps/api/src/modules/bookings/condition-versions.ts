/**
 * Condition records are versioned: the first record of a stage has id
 * cr_{bookingId}_{stage}; a correction adds cr_{bookingId}_{stage}_v{n} that
 * supersedes the previous version. Earlier versions stay readable.
 */

import type { ConditionStage } from "@neighborhood/contracts";
import type { ConditionReportDoc } from "../exchange/exchange.types.js";
import { conditionVersion } from "../exchange/exchange.types.js";
import { ids } from "../exchange/ids.js";

export interface ConditionVersions {
  collection: ConditionReportDoc | null;
  return: ConditionReportDoc | null;
  /** Older versions, oldest first. */
  superseded: ConditionReportDoc[];
}

export function versionId(bookingId: string, stage: ConditionStage, version: number): string {
  const first = ids.conditionReport(bookingId, stage);
  return version <= 1 ? first : `${first}_v${version}`;
}

/** Fill defaults for records written before Sprint 3. */
export function withVersion(doc: ConditionReportDoc): ConditionReportDoc {
  return { ...doc, version: conditionVersion(doc), supersedesId: doc.supersedesId ?? null };
}

export function latestByStage(docs: ConditionReportDoc[]): ConditionVersions {
  const sorted = docs.map(withVersion).sort((a, b) => a.version - b.version);
  const latest = (stage: ConditionStage) => [...sorted].reverse().find((d) => d.stage === stage) ?? null;
  const collection = latest("collection");
  const ret = latest("return");
  return {
    collection,
    return: ret,
    superseded: sorted.filter((d) => d.id !== collection?.id && d.id !== ret?.id),
  };
}
