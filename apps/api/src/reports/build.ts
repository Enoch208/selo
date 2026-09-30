import {
  checkIds,
  formatMicros,
  reduceVerdict,
  type ReleaseReport,
  type ReportObservedResponse,
  type ReportScenario,
} from "@selo/core";
import { z } from "zod";
import type { Db, EvidenceRow } from "../db/client";
import { orderedChecks, scenarioDurationMs } from "./checks";
import { storedContract } from "./expected";
import { loadJobRecords, type JobRecords } from "./records";

const nullableString = z.string().nullable().optional();

const observedSchema = z.looseObject({
  status: z.number(),
  contentType: nullableString,
  bodySha256: nullableString,
  bodyBytes: z.number().nullable().optional(),
  txId: nullableString,
  requestedAt: nullableString,
});

function latest(evidence: readonly EvidenceRow[], kind: string): EvidenceRow | undefined {
  return evidence.filter((row) => row.kind === kind).at(-1);
}

function responseMetadata(row: EvidenceRow | undefined): ReportObservedResponse | null {
  const parsed = observedSchema.safeParse(row?.sanitizedJson);
  if (!parsed.success) {
    return null;
  }
  const observed = parsed.data;
  return {
    status: observed.status,
    contentType: observed.contentType ?? null,
    bodySha256: observed.bodySha256 ?? null,
    bodyBytes: observed.bodyBytes ?? null,
    txId: observed.txId ?? null,
    requestedAt: observed.requestedAt ?? null,
  };
}

function scenarioViews(records: JobRecords): readonly ReportScenario[] {
  return checkIds.flatMap((id) => {
    const row = records.scenarios.find((scenario) => scenario.scenarioKey === id);
    if (row === undefined) {
      return [];
    }
    return [
      {
        check: id,
        operationId: row.operationId,
        status: row.status,
        attempts: row.attemptCount,
        durationMs: scenarioDurationMs(row),
        failureCode: row.failureCode,
      },
    ];
  });
}

export function reportFrom(records: JobRecords): ReleaseReport {
  const { job, preflight, authorization, payments, evidence } = records;
  const checks = orderedChecks(records.scenarios);
  return {
    jobId: job.id,
    project: authorization.project,
    target: { url: preflight.targetUrl, method: preflight.httpMethod },
    testedAt: (job.startedAt ?? job.completedAt)?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    seloVersion: job.gitSha ?? "unknown",
    verdict: job.verdict,
    inconclusiveReason: job.inconclusiveReason,
    checks,
    warnings: reduceVerdict(checks, null).warnings,
    failureCodes: checks
      .filter((check) => check.status === "FAIL" || check.status === "INCONCLUSIVE")
      .map((check) => check.code),
    targetChallengeSha256: latest(evidence, "target_challenge")?.sha256 ?? null,
    expected: job.expectedJson === null ? null : storedContract(job.expectedJson),
    observedResponse: responseMetadata(latest(evidence, "paid_response")),
    money: {
      inboundTxId: job.incomingTxId,
      downstreamSpendUsdc: formatMicros(job.settledSpendMicros),
      unresolvedSpendUsdc: formatMicros(job.unresolvedSpendMicros),
      downstreamTxIds: payments.flatMap((payment) =>
        payment.status === "SETTLED" && payment.txId !== null ? [payment.txId] : [],
      ),
      payments: payments.map((payment) => ({
        status: payment.status,
        amountUsdc: formatMicros(payment.amountMicros),
        txId: payment.txId,
        expectedTxId: payment.expectedTxId,
      })),
    },
    scenarios: scenarioViews(records),
  };
}

export async function buildReport(db: Db, jobId: string): Promise<ReleaseReport> {
  return reportFrom(await loadJobRecords(db, jobId));
}
