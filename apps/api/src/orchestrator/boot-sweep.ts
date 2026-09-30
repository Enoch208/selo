import {
  assertScenarioTransition,
  isLegalJobTransition,
  isVerdictStatus,
  reduceVerdict,
  verdicts,
  type CheckResult,
  type JobStatus,
} from "@selo/core";
import { and, eq, inArray, isNotNull, isNull, lt, ne, sql } from "drizzle-orm";
import type { ReleaseJobRow, ScenarioRow } from "../db/client";
import { downstreamPayments, releaseJobs, scenarios } from "../db/schema";
import { sanitize } from "../evidence/sanitize";
import { markDownstreamUnresolved } from "../ledger/transitions";
import { markUnresolved } from "../release/jobs";
import { orderedChecks } from "../reports/checks";
import type { RunnerDeps } from "./deps";
import { writeReport } from "./finish";
import { moveJob } from "./job-state";
import { alert, describeError } from "./log";

export type SweepDeps = Pick<RunnerDeps, "db" | "reports" | "wallClockMs">;

export const readyStaleMs = 5 * 60_000;
export const sweepGraceMs = 15_000;

const strandedStatuses = [
  "INBOUND_SETTLED",
  "QUEUED",
  "RUNNING_PREFLIGHT_RECHECK",
  "RUNNING",
  "ANALYZING",
] as const satisfies readonly JobStatus[];

const restartReason =
  "Selo restarted while the payment was open; a signed header may have been sent";

function interrupted(row: ScenarioRow): CheckResult {
  const planned = row.status === "PLANNED";
  return {
    id: row.scenarioKey,
    status: "INCONCLUSIVE",
    code: planned ? "NOT_RUN" : "INTERNAL_ERROR",
    blocking: true,
    summary: planned
      ? `The ${row.scenarioKey} check did not run before Selo restarted.`
      : `The ${row.scenarioKey} check was interrupted when Selo restarted.`,
    evidence: [],
  };
}

async function holdOpenPayments(deps: SweepDeps, jobId: string): Promise<number> {
  const open = await deps.db
    .select()
    .from(downstreamPayments)
    .where(and(eq(downstreamPayments.jobId, jobId), eq(downstreamPayments.status, "RESERVED")));
  for (const payment of open) {
    await markDownstreamUnresolved(deps.db, payment.id, {
      reason: restartReason,
      requestedAt: payment.requestedAt ?? payment.createdAt,
    });
  }
  return open.length;
}

async function closeScenarios(deps: SweepDeps, jobId: string): Promise<void> {
  const open = await deps.db
    .select()
    .from(scenarios)
    .where(and(eq(scenarios.jobId, jobId), ne(scenarios.status, "EVALUATED")));
  for (const row of open) {
    assertScenarioTransition(row.status, "EVALUATED");
    const check = interrupted(row);
    await deps.db
      .update(scenarios)
      .set({
        status: "EVALUATED",
        failureCode: check.code,
        observedJson: sanitize({ check, observation: { interrupted: "restart" }, durationMs: 0 }),
        completedAt: sql`clock_timestamp()`,
      })
      .where(and(eq(scenarios.id, row.id), eq(scenarios.status, row.status)));
  }
}

const internalError = { verdict: "INCONCLUSIVE", inconclusiveReason: "INTERNAL_ERROR" } as const;

async function verdictAfterRestart(deps: SweepDeps, job: ReleaseJobRow) {
  const rows = await deps.db.select().from(scenarios).where(eq(scenarios.jobId, job.id));
  const outcome = reduceVerdict(orderedChecks(rows), "INTERNAL_ERROR");
  return isLegalJobTransition(job.status, outcome.verdict) ? outcome : internalError;
}

async function concludeStranded(deps: SweepDeps, job: ReleaseJobRow): Promise<void> {
  const held = await holdOpenPayments(deps, job.id);
  await closeScenarios(deps, job.id);
  const outcome = await verdictAfterRestart(deps, job);
  await moveJob(deps.db, job.id, job.status, outcome.verdict, {
    verdict: outcome.verdict,
    inconclusiveReason: outcome.inconclusiveReason,
  });
  await writeReport(deps, job.id, outcome.verdict);
  alert("job_swept_after_restart", job.id, {
    from: job.status,
    verdict: outcome.verdict,
    heldPayments: held,
  });
}

async function sweepEach(
  jobs: readonly ReleaseJobRow[],
  sweep: (job: ReleaseJobRow) => Promise<void>,
): Promise<void> {
  for (const job of jobs) {
    try {
      await sweep(job);
    } catch (error: unknown) {
      alert("job_sweep_failed", job.id, { status: job.status, cause: describeError(error) });
    }
  }
}

function settledBefore(cutoff: Date) {
  return sql`coalesce(${releaseJobs.incomingSettledAt}, ${releaseJobs.createdAt}) < ${cutoff.toISOString()}::timestamptz`;
}

async function completeUnwrittenReports(deps: SweepDeps, cutoff: Date): Promise<void> {
  const unwritten = await deps.db
    .select()
    .from(releaseJobs)
    .where(
      and(
        inArray(releaseJobs.status, verdicts),
        isNull(releaseJobs.reportTokenHash),
        isNotNull(releaseJobs.incomingSettledAt),
        settledBefore(cutoff),
      ),
    );
  await sweepEach(unwritten, async (job) => {
    if (isVerdictStatus(job.status)) {
      await writeReport(deps, job.id, job.status);
      alert("job_report_completed_after_restart", job.id, { verdict: job.status });
    }
  });
}

export async function sweepStrandedJobs(deps: SweepDeps, now: Date): Promise<void> {
  const runCutoff = new Date(now.getTime() - deps.wallClockMs - sweepGraceMs);
  const stranded = await deps.db
    .select()
    .from(releaseJobs)
    .where(and(inArray(releaseJobs.status, strandedStatuses), settledBefore(runCutoff)));
  await sweepEach(stranded, (job) => concludeStranded(deps, job));
  await completeUnwrittenReports(deps, runCutoff);
  const readyCutoff = new Date(now.getTime() - readyStaleMs);
  const unsettled = await deps.db
    .select()
    .from(releaseJobs)
    .where(and(eq(releaseJobs.status, "READY"), lt(releaseJobs.createdAt, readyCutoff)));
  await sweepEach(unsettled, async (job) => {
    await markUnresolved(deps.db, job.id, null);
    alert("ready_job_swept_after_restart", job.id, {
      detail: "inbound settlement never completed; the transaction is unknown",
    });
  });
}

export function scheduleResweep(deps: SweepDeps): Promise<void> {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      sweepStrandedJobs(deps, new Date())
        .catch((error: unknown) => {
          process.stderr.write(`ALERT event=job_resweep_failed cause=${describeError(error)}\n`);
        })
        .finally(resolve);
    }, deps.wallClockMs + sweepGraceMs);
    timer.unref();
  });
}
