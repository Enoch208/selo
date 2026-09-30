import type { Executor } from "../db/client";
import { evidence } from "../db/schema";
import { newId } from "../ids";
import { canonicalJson, sha256Hex } from "./canonical";
import { sanitize } from "./sanitize";

export const evidenceKinds = [
  "target_challenge",
  "paid_response",
  "downstream_payment",
  "inbound_settlement",
  "replay_response",
  "catalog_record",
  "response_contract",
  "authorization_snapshot",
] as const;

export type EvidenceKind = (typeof evidenceKinds)[number];

export interface EvidenceInput {
  readonly jobId: string;
  readonly scenarioId: string | null;
  readonly kind: EvidenceKind;
  readonly value: unknown;
}

export class EmptyEvidence extends Error {
  constructor(kind: EvidenceKind) {
    super(`Evidence of kind ${kind} has no value to record`);
    this.name = "EmptyEvidence";
  }
}

export async function recordEvidence(db: Executor, input: EvidenceInput): Promise<string> {
  if (input.value === null || input.value === undefined) {
    throw new EmptyEvidence(input.kind);
  }
  const sanitized = sanitize(input.value);
  const id = newId("evd");
  await db.insert(evidence).values({
    id,
    jobId: input.jobId,
    scenarioId: input.scenarioId,
    kind: input.kind,
    sha256: sha256Hex(canonicalJson(sanitized)),
    sanitizedJson: sanitized,
  });
  return id;
}
