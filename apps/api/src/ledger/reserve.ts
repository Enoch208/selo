import { and, eq, sql } from "drizzle-orm";
import {
  evaluateSpend,
  type SpendDenialReason,
  type SpendGuardAuthorization,
  type SpendGuardJob,
  type SpendGuardPayment,
} from "@selo/core";
import type { Db, ReleaseJobRow, Tx } from "../db/client";
import { downstreamPayments, releaseJobs, scenarios } from "../db/schema";
import { newId } from "../ids";
import { UnknownJob } from "./books";

export interface ReservePayment extends SpendGuardPayment {
  readonly payTo: string;
  readonly requirementsHash: string;
}

export interface ReserveInput {
  readonly jobId: string;
  readonly scenarioId: string;
  readonly authorization: SpendGuardAuthorization | null;
  readonly payment: ReservePayment;
  readonly scenarioMaxSpendMicros: number;
  readonly absoluteCapMicros: number;
  readonly allowedNetwork: string;
  readonly allowedAsset: string;
  readonly now: Date;
}

export type ReserveResult =
  | { readonly reserved: true; readonly paymentId: string }
  | { readonly reserved: false; readonly reason: SpendDenialReason };

export class ScenarioNotInJob extends Error {
  constructor(scenarioId: string, jobId: string) {
    super(`Scenario ${scenarioId} does not belong to release job ${jobId}`);
    this.name = "ScenarioNotInJob";
  }
}

async function assertScenarioInJob(tx: Tx, scenarioId: string, jobId: string): Promise<void> {
  const [scenario] = await tx
    .select({ id: scenarios.id })
    .from(scenarios)
    .where(and(eq(scenarios.id, scenarioId), eq(scenarios.jobId, jobId)));
  if (scenario === undefined) {
    throw new ScenarioNotInJob(scenarioId, jobId);
  }
}

async function loadJob(tx: Tx, jobId: string): Promise<ReleaseJobRow> {
  const [job] = await tx.select().from(releaseJobs).where(eq(releaseJobs.id, jobId));
  if (job === undefined) {
    throw new UnknownJob(jobId);
  }
  return job;
}

function guardView(job: ReleaseJobRow): SpendGuardJob {
  return {
    status: job.status,
    maxSpendMicros: job.maxSpendMicros,
    settledMicros: job.settledSpendMicros,
    reservedMicros: job.reservedSpendMicros,
    unresolvedMicros: job.unresolvedSpendMicros,
  };
}

async function claimCapacity(tx: Tx, jobId: string, amountMicros: number): Promise<boolean> {
  const amount = sql`${amountMicros}::bigint`;
  const claimed = await tx
    .update(releaseJobs)
    .set({ reservedSpendMicros: sql`${releaseJobs.reservedSpendMicros} + ${amount}` })
    .where(
      and(
        eq(releaseJobs.id, jobId),
        eq(releaseJobs.status, "RUNNING"),
        eq(releaseJobs.unresolvedSpendMicros, 0),
        sql`${releaseJobs.settledSpendMicros} + ${releaseJobs.reservedSpendMicros} + ${releaseJobs.unresolvedSpendMicros} + ${amount} <= ${releaseJobs.maxSpendMicros}`,
      ),
    )
    .returning({ id: releaseJobs.id });
  return claimed.length === 1;
}

function lostRace(job: ReleaseJobRow): SpendDenialReason {
  if (job.status !== "RUNNING") {
    return "JOB_NOT_RUNNING";
  }
  if (job.unresolvedSpendMicros !== 0) {
    return "PAYMENT_UNRESOLVED";
  }
  return "JOB_BUDGET_EXCEEDED";
}

async function reserveWithin(tx: Tx, input: ReserveInput): Promise<ReserveResult> {
  const job = await loadJob(tx, input.jobId);
  await assertScenarioInJob(tx, input.scenarioId, input.jobId);
  const verdict = evaluateSpend({ ...input, job: guardView(job) });
  if (!verdict.allowed) {
    return { reserved: false, reason: verdict.reason };
  }
  const { payment } = input;
  if (!(await claimCapacity(tx, input.jobId, payment.amountMicros))) {
    return { reserved: false, reason: lostRace(await loadJob(tx, input.jobId)) };
  }
  const paymentId = newId("pay");
  await tx.insert(downstreamPayments).values({
    id: paymentId,
    jobId: input.jobId,
    scenarioId: input.scenarioId,
    targetOrigin: payment.origin,
    amountMicros: payment.amountMicros,
    network: payment.network,
    assetId: payment.asset,
    payTo: payment.payTo,
    paymentRequirementsHash: payment.requirementsHash,
    status: "RESERVED",
  });
  return { reserved: true, paymentId };
}

export function reserveDownstream(db: Db, input: ReserveInput): Promise<ReserveResult> {
  return db.transaction((tx) => reserveWithin(tx, input));
}
