import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import type { Tx } from "../../src/db/client";
import { downstreamPayments, releaseJobs } from "../../src/db/schema";
import { jobBooks } from "../../src/ledger/books";
import { reserveDownstream, type ReserveResult } from "../../src/ledger/reserve";
import { db, resetDatabaseBetweenTests } from "../support";
import { reserveInput, seedJob, separateConnections, type SeededJob } from "./fixtures";

resetDatabaseBetweenTests();

const [holder, racer] = separateConnections(2);

async function blockedOnLock(): Promise<boolean> {
  const rows = await db.execute<{ waiting: number }>(
    sql`select count(*)::int as waiting from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
  );
  return (rows[0]?.waiting ?? 0) > 0;
}

async function untilBlocked(): Promise<void> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    if (await blockedOnLock()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("the racing reservation never waited on the job row");
}

async function raceAgainst(
  job: SeededJob,
  change: (tx: Tx) => Promise<unknown>,
): Promise<ReserveResult> {
  if (holder === undefined || racer === undefined) {
    throw new Error("separate connections were not created");
  }
  let pending: Promise<ReserveResult> | undefined;
  await holder.transaction(async (tx) => {
    await change(tx);
    pending = reserveDownstream(racer, reserveInput(job, 10_000));
    await untilBlocked();
  });
  if (pending === undefined) {
    throw new Error("the racing reservation never started");
  }
  return pending;
}

describe("a reservation that passes the guard but loses the conditional update", () => {
  it("reports JOB_NOT_RUNNING when the job stops between guard and update", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    const result = await raceAgainst(job, (tx) =>
      tx.update(releaseJobs).set({ status: "INCONCLUSIVE" }).where(eq(releaseJobs.id, job.jobId)),
    );
    expect(result).toEqual({ reserved: false, reason: "JOB_NOT_RUNNING" });
    expect((await jobBooks(db, job.jobId)).sums.reserved).toBe(0);
  });

  it("reports PAYMENT_UNRESOLVED when a payment turns unresolved between guard and update", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    const first = await reserveDownstream(db, reserveInput(job, 20_000));
    if (!first.reserved) {
      throw new Error("seed reservation was denied");
    }
    const result = await raceAgainst(job, async (tx) => {
      await tx
        .update(downstreamPayments)
        .set({ status: "UNRESOLVED" })
        .where(eq(downstreamPayments.id, first.paymentId));
      await tx
        .update(releaseJobs)
        .set({ reservedSpendMicros: 0, unresolvedSpendMicros: 20_000 })
        .where(eq(releaseJobs.id, job.jobId));
    });
    expect(result).toEqual({ reserved: false, reason: "PAYMENT_UNRESOLVED" });
    const books = await jobBooks(db, job.jobId);
    expect(books.counters).toEqual({ settled: 0, reserved: 0, unresolved: 20_000 });
  });
});
