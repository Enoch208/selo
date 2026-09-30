import {
  isLegalJobTransition,
  isVerdictStatus,
  reduceVerdict,
  type CheckResult,
  type JobStatus,
  type Verdict,
} from "@selo/core";
import type { ReleaseJobRow } from "../db/client";
import { markDownstreamUnresolved } from "../ledger/transitions";
import { reportToken } from "../reports/token";
import type { JobContext } from "./context";
import type { RunnerDeps } from "./deps";
import { writeReport } from "./finish";
import { currentJob, moveJob } from "./job-state";
import { alert, describeError } from "./log";
import type { Scenario } from "./scenario";

async function attempt(jobId: string, what: string, action: () => Promise<unknown>): Promise<void> {
  try {
    await action();
  } catch (error: unknown) {
    alert("internal_error_cleanup_failed", jobId, { step: what, message: describeError(error) });
  }
}

function interrupted(scenario: Scenario): CheckResult {
  return {
    id: scenario.checkId,
    status: "INCONCLUSIVE",
    code: scenario.status === "PLANNED" ? "NOT_RUN" : "INTERNAL_ERROR",
    blocking: true,
    summary: `The ${scenario.checkId} check was interrupted by an internal Selo error.`,
    evidence: [],
  };
}

async function holdOpenPayment(ctx: JobContext): Promise<void> {
  const open = ctx.state.openPayment;
  if (open === null) {
    return;
  }
  await attempt(ctx.job.id, "hold open payment", async () => {
    const result = await markDownstreamUnresolved(ctx.db, open.paymentId, {
      reason: "internal error while the payment was open",
      requestedAt: open.requestedAt,
    });
    ctx.state.openPayment = null;
    alert("downstream_unresolved", ctx.job.id, {
      paymentId: open.paymentId,
      result: result.applied ? result.status : "not applied",
    });
  });
}

async function closeScenarios(ctx: JobContext): Promise<void> {
  for (const scenario of Object.values(ctx.scenarios)) {
    if (!scenario.evaluated) {
      await attempt(ctx.job.id, `close ${scenario.checkId}`, () =>
        scenario.evaluate(interrupted(scenario), { interrupted: true }),
      );
    }
  }
}

const internalError = { verdict: "INCONCLUSIVE", inconclusiveReason: "INTERNAL_ERROR" } as const;

function verdictAfterError(ctx: JobContext | null, from: JobStatus) {
  const outcome =
    ctx === null ? internalError : reduceVerdict(ctx.state.checks(), "INTERNAL_ERROR");
  return isLegalJobTransition(from, outcome.verdict) ? outcome : internalError;
}

async function settledVerdict(
  deps: RunnerDeps,
  job: ReleaseJobRow,
  ctx: JobContext | null,
): Promise<Verdict | null> {
  const current = await currentJob(deps.db, job.id);
  if (current === undefined || current.status === "REPORT_WRITTEN") {
    return null;
  }
  if (isVerdictStatus(current.status)) {
    return current.status;
  }
  const outcome = verdictAfterError(ctx, current.status);
  await moveJob(deps.db, job.id, current.status, outcome.verdict, {
    verdict: outcome.verdict,
    inconclusiveReason: outcome.inconclusiveReason,
  });
  return outcome.verdict;
}

export async function recoverFromInternalError(
  deps: RunnerDeps,
  job: ReleaseJobRow,
  ctx: JobContext | null,
  error: unknown,
): Promise<string> {
  alert("internal_error", job.id, { message: describeError(error) });
  if (ctx !== null) {
    await holdOpenPayment(ctx);
    await closeScenarios(ctx);
  }
  const verdict = await settledVerdict(deps, job, ctx);
  if (verdict === null) {
    return reportToken(deps.reports.tokenSecret, job.id);
  }
  return writeReport(deps, job.id, verdict);
}
