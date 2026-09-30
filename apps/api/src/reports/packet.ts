import { constants } from "node:fs";
import { access, chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { formatMicros } from "@selo/core";
import type { Db, DownstreamPaymentRow, EvidenceRow, ScenarioRow } from "../db/client";
import { sanitize } from "../evidence/sanitize";
import { loadJobRecords, type JobRecords } from "./records";

const privateDirectory = 0o700;
const privateFile = 0o600;

function evidenceView(row: EvidenceRow) {
  return { id: row.id, kind: row.kind, sha256: row.sha256, value: row.sanitizedJson };
}

function scenarioView(row: ScenarioRow, evidence: readonly EvidenceRow[]) {
  return {
    id: row.id,
    check: row.scenarioKey,
    operationId: row.operationId,
    status: row.status,
    blocking: row.blocking,
    attempts: row.attemptCount,
    failureCode: row.failureCode,
    expected: row.expectedJson,
    observed: row.observedJson,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    evidence: evidence.filter((item) => item.scenarioId === row.id).map(evidenceView),
  };
}

function paymentView(row: DownstreamPaymentRow) {
  return {
    id: row.id,
    scenarioId: row.scenarioId,
    status: row.status,
    amountUsdc: formatMicros(row.amountMicros),
    network: row.network,
    assetId: row.assetId,
    payTo: row.payTo,
    targetOrigin: row.targetOrigin,
    txId: row.txId,
    expectedTxId: row.expectedTxId,
    paymentRequirementsHash: row.paymentRequirementsHash,
    resolutionReason: row.resolutionReason,
    requestedAt: row.requestedAt,
    settledAt: row.settledAt,
  };
}

export function evidencePacket(records: JobRecords, generatedAt: Date): unknown {
  const { job, preflight, authorization, evidence } = records;
  const snapshots = evidence.filter((item) => item.kind === "authorization_snapshot");
  return sanitize({
    jobId: job.id,
    version: 1,
    target: {
      url: preflight.targetUrl,
      method: preflight.httpMethod,
      preflightId: preflight.id,
      preflightRequirementsHash: preflight.paymentRequirementsHash,
    },
    authorization: {
      id: authorization.id,
      type: authorization.authorizationType,
      status: authorization.status,
      origin: authorization.origin,
      routePath: authorization.routePath,
      method: authorization.httpMethod,
      verifiedAt: authorization.verifiedAt,
      expiresAt: authorization.expiresAt,
      snapshots: snapshots.map(evidenceView),
    },
    inboundPayment: {
      txId: job.incomingTxId,
      payer: job.payer,
      amountUsdc: job.incomingAmountMicros === null ? null : formatMicros(job.incomingAmountMicros),
      settledAt: job.incomingSettledAt,
    },
    scenarios: records.scenarios.map((row) => scenarioView(row, evidence)),
    downstreamPayments: records.payments.map(paymentView),
    verdict: job.verdict,
    verdictDetail: { verdict: job.verdict, inconclusiveReason: job.inconclusiveReason },
    generatedAt,
  });
}

export async function writeEvidencePacket(
  db: Db,
  reportsDir: string,
  jobId: string,
): Promise<string> {
  const packet = evidencePacket(await loadJobRecords(db, jobId), new Date());
  const directory = join(reportsDir, jobId);
  await mkdir(directory, { recursive: true, mode: privateDirectory });
  await chmod(directory, privateDirectory);
  const path = join(directory, "evidence.json");
  await writeFile(path, `${JSON.stringify(packet, null, 2)}\n`, { mode: privateFile });
  await chmod(path, privateFile);
  return path;
}

export class ReportsDirUnusable extends Error {
  override readonly name = "ReportsDirUnusable";
}

export async function ensureReportsDir(reportsDir: string): Promise<void> {
  try {
    await mkdir(reportsDir, { recursive: true, mode: privateDirectory });
  } catch (error: unknown) {
    throw new ReportsDirUnusable(`REPORTS_DIR ${reportsDir} cannot be created`, { cause: error });
  }
  try {
    await access(reportsDir, constants.W_OK | constants.X_OK);
  } catch (error: unknown) {
    throw new ReportsDirUnusable(`REPORTS_DIR ${reportsDir} is not writable`, { cause: error });
  }
}
