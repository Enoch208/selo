import type { ReleaseTestResponse } from "@selo/core";
import { sql } from "drizzle-orm";
import { z } from "zod";
import type { ReleaseJobRow } from "../db/client";
import { parseTarget } from "../net/target";
import { findPreflight } from "../preflight/store";
import type { ReleaseRunner } from "../release/deps";
import { buildReport } from "../reports/build";
import { toReleaseTestResponse } from "../reports/response";
import { reportToken, reportUrlFor } from "../reports/token";
import type { JobContext } from "./context";
import { runResponseContract } from "./contract";
import type { RunnerDeps } from "./deps";
import { runDiscovery } from "./discovery";
import { concludeJob } from "./finish";
import { runHandshake } from "./handshake";
import { claimForRun, currentJob, moveJob } from "./job-state";
import { logEvent } from "./log";
import { runPaidDelivery } from "./paid";
import { recheckAuthorization } from "./recheck";
import { recoverFromInternalError } from "./recover";
import { runRetry } from "./retry";
import { planScenarios } from "./scenario";
import { RunState } from "./state";
import { createTargetIo } from "./target-io";

const requestBodySchema = z.json().nullable();

async function openContext(
  deps: RunnerDeps,
  job: ReleaseJobRow,
  signal: AbortSignal,
): Promise<JobContext> {
  await moveJob(deps.db, job.id, "QUEUED", "RUNNING_PREFLIGHT_RECHECK");
  const preflight = await findPreflight(deps.db, job.preflightId);
  const parsed = parseTarget(preflight.targetUrl);
  if (!parsed.ok) {
    throw new Error(`Preflight ${preflight.id} holds an invalid target (${parsed.reason})`);
  }
  const target = parsed.target;
  const body = requestBodySchema.parse(preflight.requestBodyJson) ?? undefined;
  const scenarios = await planScenarios(
    { db: deps.db, jobId: job.id, targetOrigin: target.origin },
    {
      handshake: { method: preflight.httpMethod, url: target.href },
      paid_delivery: { maxSpendMicros: job.maxSpendMicros },
      response_contract: job.expectedJson ?? {},
      discovery_contract: { resourceUrl: target.href, method: preflight.httpMethod },
      retry_safety: { idempotencyKey: `${job.id}:paid_delivery` },
    },
  );
  return {
    deps,
    db: deps.db,
    job,
    preflight,
    target,
    method: preflight.httpMethod,
    body,
    signal,
    scenarios,
    io: createTargetIo(deps, target.origin, signal),
    state: new RunState(),
  };
}

async function runChecks(ctx: JobContext): Promise<string> {
  if (!(await recheckAuthorization(ctx, "run_start", null))) {
    ctx.state.inconclusive("AUTHORIZATION_LAPSED");
    return concludeJob(ctx, "RUNNING_PREFLIGHT_RECHECK", false);
  }
  await moveJob(ctx.db, ctx.job.id, "RUNNING_PREFLIGHT_RECHECK", "RUNNING", {
    startedAt: sql`clock_timestamp()`,
  });
  const handshake = await runHandshake(ctx);
  const { requirement } = handshake;
  if (handshake.check.status !== "PASS" || requirement === null) {
    return concludeJob(ctx, "RUNNING", false);
  }
  const delivery = await runPaidDelivery(ctx, handshake, requirement);
  await runResponseContract(ctx, delivery);
  await runDiscovery(ctx, handshake, requirement);
  await runRetry(ctx, delivery);
  return concludeJob(ctx, "RUNNING", true);
}

async function execute(deps: RunnerDeps, job: ReleaseJobRow): Promise<string> {
  const startedMs = Date.now();
  const signal = AbortSignal.timeout(deps.wallClockMs);
  let ctx: JobContext | null = null;
  let token: string;
  try {
    ctx = await openContext(deps, job, signal);
    token = await runChecks(ctx);
  } catch (error: unknown) {
    token = await recoverFromInternalError(deps, job, ctx, error);
  }
  logEvent({
    event: "job_finished",
    jobId: job.id,
    incomingTxId: job.incomingTxId,
    durationMs: Date.now() - startedMs,
  });
  return token;
}

export function createJobRunner(deps: RunnerDeps): ReleaseRunner {
  const respond = async (jobId: string, token: string): Promise<ReleaseTestResponse> =>
    toReleaseTestResponse(
      await buildReport(deps.db, jobId),
      reportUrlFor(deps.reports.publicBaseUrl, token),
    );

  return {
    async run(jobId) {
      const job = await claimForRun(deps.db, jobId);
      return respond(jobId, await execute(deps, job));
    },
    async result(jobId) {
      const job = await currentJob(deps.db, jobId);
      if (job?.status !== "REPORT_WRITTEN") {
        return null;
      }
      return respond(jobId, reportToken(deps.reports.tokenSecret, jobId));
    },
  };
}
