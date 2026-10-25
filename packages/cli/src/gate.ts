import {
  checkIds,
  checkStatuses,
  inconclusiveReasons,
  reduceVerdict,
  verdicts,
  type ReleaseTestResponse,
  type Verdict,
} from "@selo/core";
import { z } from "zod";
import { exitCodes, type ExitCode } from "./exit";

const checkSchema = z.looseObject({
  id: z.enum(checkIds),
  status: z.enum(checkStatuses),
  code: z.string(),
  blocking: z.boolean(),
  summary: z.string(),
  evidence: z.array(z.string()),
});

const reportSchema = z.looseObject({
  jobId: z.string().min(1),
  verdict: z.enum(verdicts),
  target: z.string(),
  checks: z.array(checkSchema),
  warnings: z.array(z.string()),
  inconclusiveReason: z.enum(inconclusiveReasons).nullable(),
  money: z.looseObject({
    seloInboundTxId: z.string(),
    downstreamSpendUsdc: z.string(),
    downstreamTxIds: z.array(z.string()),
  }),
  reportUrl: z.string(),
});

export type ParsedReport =
  | { readonly ok: true; readonly report: ReleaseTestResponse }
  | { readonly ok: false; readonly issue: string };

export function parseReport(body: unknown): ParsedReport {
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) {
    const where = parsed.error.issues.map((issue) => issue.path.join(".") || "(root)");
    return {
      ok: false,
      issue: `the release test answer is not a Selo report (${where.join(", ")})`,
    };
  }
  return { ok: true, report: parsed.data };
}

export type Gate = "ALLOW" | "BLOCK";

export interface GateDecision {
  readonly gate: Gate;
  readonly exitCode: ExitCode;
  readonly reason: string;
}

const block = (exitCode: ExitCode, reason: string): GateDecision => ({
  gate: "BLOCK",
  exitCode,
  reason,
});

function recomputed(report: ReleaseTestResponse): Verdict | null {
  try {
    return reduceVerdict(report.checks, report.inconclusiveReason).verdict;
  } catch {
    return null;
  }
}

function missingProof(report: ReleaseTestResponse): string | null {
  const missing = checkIds.filter((id) => !report.checks.some((check) => check.id === id));
  if (missing.length > 0) {
    return `the report has no result for ${missing.join(", ")}`;
  }
  if (report.money.seloInboundTxId === "") {
    return "the report carries no inbound settlement transaction";
  }
  if (report.money.downstreamTxIds.length === 0) {
    return "the report carries no downstream payment transaction";
  }
  if (report.reportUrl === "") {
    return "the report carries no report link";
  }
  return null;
}

export function decideGate(report: ReleaseTestResponse): GateDecision {
  const derived = recomputed(report);
  if (derived !== report.verdict) {
    return block(
      exitCodes.inconclusive,
      `the reported verdict ${report.verdict} does not follow from its checks (${derived ?? "unreadable"})`,
    );
  }
  if (report.verdict === "FAIL") {
    const failed = report.checks.filter((check) => check.blocking && check.status === "FAIL");
    return block(exitCodes.fail, `FAIL: ${failed.map((check) => check.id).join(", ")}`);
  }
  if (report.verdict === "INCONCLUSIVE") {
    return block(
      exitCodes.inconclusive,
      `INCONCLUSIVE: ${report.inconclusiveReason ?? "evidence incomplete"}`,
    );
  }
  const gap = missingProof(report);
  if (gap !== null) {
    return block(exitCodes.inconclusive, `PASS is not fully evidenced: ${gap}`);
  }
  return { gate: "ALLOW", exitCode: exitCodes.pass, reason: "PASS on every release check" };
}
