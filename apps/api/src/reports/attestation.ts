import { createHash, createPublicKey, sign, type KeyObject } from "node:crypto";
import {
  attestationSchemaVersion,
  canonicalJson,
  formatMicros,
  type AttestationKey,
  type AttestedEvidence,
  type ReleaseAttestation,
  type ReleaseAttestationPayload,
  type ReleaseReport,
} from "@selo/core";
import { sha256Hex } from "../ids";
import type { SeloNetwork } from "../payments/networks";
import type { JobRecords } from "./records";

export interface AttestationSigner {
  readonly key: AttestationKey;
  sign(payload: ReleaseAttestationPayload): ReleaseAttestation;
}

export interface AttestationContext {
  readonly issuer: string;
  readonly network: SeloNetwork;
}

function publicKeyOf(privateKey: KeyObject): string {
  const jwk = createPublicKey(privateKey).export({ format: "jwk" });
  if (typeof jwk.x !== "string") {
    throw new Error("the attestation key has no Ed25519 public component");
  }
  return jwk.x;
}

export function createAttestationSigner(privateKey: KeyObject): AttestationSigner {
  if (privateKey.asymmetricKeyType !== "ed25519") {
    throw new Error("the attestation key must be an Ed25519 private key");
  }
  const publicKey = publicKeyOf(privateKey);
  const digest = createHash("sha256").update(Buffer.from(publicKey, "base64url")).digest("hex");
  const keyId = `selo-ed25519-${digest.slice(0, 16)}`;
  return {
    key: { keyId, algorithm: "Ed25519", publicKey },
    sign: (payload) => ({
      payload,
      signature: {
        algorithm: "Ed25519",
        keyId,
        value: sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString("base64url"),
      },
    }),
  };
}

function evidenceManifest(records: JobRecords): readonly AttestedEvidence[] {
  return records.evidence
    .map(({ id, kind, sha256 }) => ({ id, kind, sha256 }))
    .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
}

export function attestationPayload(
  records: JobRecords,
  report: ReleaseReport,
  context: AttestationContext,
): ReleaseAttestationPayload | null {
  if (report.verdict === null || report.completedAt === null) {
    return null;
  }
  const { job } = records;
  const evidence = evidenceManifest(records);
  return {
    schemaVersion: attestationSchemaVersion,
    issuer: context.issuer,
    jobId: report.jobId,
    testedTarget: report.target,
    deployment:
      job.deploymentId === null
        ? null
        : { id: job.deploymentId, verification: "asserted_by_client" },
    testedAt: report.testedAt,
    completedAt: report.completedAt,
    seloVersion: report.seloVersion,
    verdict: report.verdict,
    inconclusiveReason: report.inconclusiveReason,
    checks: report.checks.map(({ id, status, code, blocking, evidence: ids }) => ({
      id,
      status,
      code,
      blocking,
      evidence: ids,
    })),
    expectedContractSha256:
      report.expected === null ? null : sha256Hex(canonicalJson(report.expected)),
    targetChallengeSha256: report.targetChallengeSha256,
    payments: {
      network: context.network.caip2,
      asset: context.network.usdcAssetId,
      inboundTxId: report.money.inboundTxId,
      inboundAmountUsdc:
        job.incomingAmountMicros === null ? null : formatMicros(job.incomingAmountMicros),
      downstream: report.money.payments.map(({ status, amountUsdc, txId }) => ({
        status,
        amountUsdc,
        txId,
      })),
    },
    evidenceSha256: sha256Hex(canonicalJson(evidence)),
    evidence,
  };
}
