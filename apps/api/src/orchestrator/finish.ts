import { reduceVerdict, type JobStatus, type Verdict } from "@selo/core";
import { sql } from "drizzle-orm";
import { sha256Hex } from "../ids";
import { writeEvidencePacket } from "../reports/packet";
import { reportToken } from "../reports/token";
import { clockExpired, type JobContext } from "./context";
import type { RunnerDeps } from "./deps";
import { moveJob } from "./job-state";
import { alert, describeError, logEvent } from "./log";
import { skipScenario } from "./skip";

type ReportDeps = Pick<RunnerDeps, "db" | "reports">;

async function writePacketBestEffort(deps: ReportDeps, jobId: string): Promise<void> {
  try {
    await writeEvidencePacket(deps.db, deps.reports.dir, jobId);
  } catch (error: unknown) {
    alert("evidence_packet_write_failed", jobId, {
      reportsDir: deps.reports.dir,
      cause: describeError(error),
    });
  }
}

export async function writeReport(
  deps: ReportDeps,
  jobId: string,
  verdict: Verdict,
): Promise<string> {
  await writePacketBestEffort(deps, jobId);
  const token = reportToken(deps.reports.tokenSecret, jobId);
  await moveJob(deps.db, jobId, verdict, "REPORT_WRITTEN", {
    reportTokenHash: sha256Hex(token),
    completedAt: sql`clock_timestamp()`,
  });
  return token;
}

export async function concludeJob(
  ctx: JobContext,
  from: Extract<JobStatus, "RUNNING_PREFLIGHT_RECHECK" | "RUNNING">,
  analyze: boolean,
): Promise<string> {
  for (const scenario of Object.values(ctx.scenarios)) {
    if (!scenario.evaluated) {
      await skipScenario(ctx, scenario, null);
    }
  }
  if (clockExpired(ctx)) {
    ctx.state.inconclusive("TARGET_TIMEOUT");
  }
  const outcome = reduceVerdict(ctx.state.checks(), ctx.state.reason);
  let current: JobStatus = from;
  if (analyze) {
    await moveJob(ctx.db, ctx.job.id, from, "ANALYZING");
    current = "ANALYZING";
  }
  await moveJob(ctx.db, ctx.job.id, current, outcome.verdict, {
    verdict: outcome.verdict,
    inconclusiveReason: outcome.inconclusiveReason,
  });
  logEvent({
    event: "job_verdict",
    jobId: ctx.job.id,
    targetOrigin: ctx.target.origin,
    incomingTxId: ctx.job.incomingTxId,
    status: outcome.verdict,
    failureCode: outcome.inconclusiveReason,
  });
  return writeReport(ctx.deps, ctx.job.id, outcome.verdict);
}
