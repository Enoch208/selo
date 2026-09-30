import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { downstreamPayments } from "../../src/db/schema";
import { jobBooks } from "../../src/ledger/books";
import { reserveDownstream } from "../../src/ledger/reserve";
import {
  markDownstreamUnresolved,
  releaseDownstream,
  settleDownstream,
} from "../../src/ledger/transitions";
import { db, resetDatabaseBetweenTests } from "../support";
import { now, reserveInput, seedJob, type SeededJob } from "./fixtures";

resetDatabaseBetweenTests();

const requestedAt = new Date(now.getTime() + 1_000);

async function reserved(job: SeededJob, amountMicros: number): Promise<string> {
  const result = await reserveDownstream(db, reserveInput(job, amountMicros));
  if (!result.reserved) {
    throw new Error(`seed reservation denied: ${result.reason}`);
  }
  return result.paymentId;
}

async function paymentRow(paymentId: string) {
  const [row] = await db
    .select()
    .from(downstreamPayments)
    .where(eq(downstreamPayments.id, paymentId));
  return row;
}

describe("settleDownstream", () => {
  it("moves the amount from reserved to settled and records tx, requested and settled times", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    const paymentId = await reserved(job, 30_000);
    expect(await settleDownstream(db, paymentId, { txId: "TX1", requestedAt })).toEqual({
      applied: true,
      status: "SETTLED",
    });
    const row = await paymentRow(paymentId);
    expect(row).toMatchObject({ status: "SETTLED", txId: "TX1", requestedAt });
    expect(row?.settledAt).toBeInstanceOf(Date);
    const books = await jobBooks(db, job.jobId);
    expect(books.counters).toEqual({ settled: 30_000, reserved: 0, unresolved: 0 });
    expect(books.sums).toMatchObject({ settled: 30_000, reserved: 0, unresolved: 0 });
  });

  it("a second settle of the same payment is not applied and changes nothing", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    const paymentId = await reserved(job, 30_000);
    await settleDownstream(db, paymentId, { txId: "TX1", requestedAt });
    const before = await jobBooks(db, job.jobId);
    const again = await settleDownstream(db, paymentId, { txId: "TX2", requestedAt });
    expect(again).toEqual({ applied: false, current: "SETTLED" });
    expect(await jobBooks(db, job.jobId)).toEqual(before);
    expect((await paymentRow(paymentId))?.txId).toBe("TX1");
  });

  it("concurrent settles of one payment apply exactly once", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    const paymentId = await reserved(job, 30_000);
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        settleDownstream(db, paymentId, { txId: `TX-${String(index)}`, requestedAt }),
      ),
    );
    expect(results.filter((result) => result.applied)).toHaveLength(1);
    const books = await jobBooks(db, job.jobId);
    expect(books.counters).toEqual({ settled: 30_000, reserved: 0, unresolved: 0 });
  });
});

describe("settleDownstream with a transaction id already recorded", () => {
  it("returns DUPLICATE_TX and leaves the payment and books unchanged", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    const first = await reserved(job, 20_000);
    const second = await reserved(job, 30_000);
    await settleDownstream(db, first, { txId: "TX-SAME", requestedAt });
    const before = await jobBooks(db, job.jobId);
    expect(await settleDownstream(db, second, { txId: "TX-SAME", requestedAt })).toEqual({
      applied: false,
      reason: "DUPLICATE_TX",
    });
    expect(await jobBooks(db, job.jobId)).toEqual(before);
    expect(await paymentRow(second)).toMatchObject({
      status: "RESERVED",
      txId: null,
      requestedAt: null,
      settledAt: null,
    });
  });
});

describe("releaseDownstream", () => {
  it("returns reserved capacity and records the reason", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    const paymentId = await reserved(job, 60_000);
    expect(await releaseDownstream(db, paymentId, { reason: "rejected 402", requestedAt })).toEqual(
      { applied: true, status: "RELEASED" },
    );
    const row = await paymentRow(paymentId);
    expect(row).toMatchObject({
      status: "RELEASED",
      resolutionReason: "rejected 402",
      requestedAt,
    });
    const books = await jobBooks(db, job.jobId);
    expect(books.counters).toEqual({ settled: 0, reserved: 0, unresolved: 0 });
    expect(books.sums.released).toBe(60_000);
    expect((await reserveDownstream(db, reserveInput(job, 100_000))).reserved).toBe(true);
  });

  it("a release that was never requested keeps requested_at empty", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    const paymentId = await reserved(job, 10_000);
    await releaseDownstream(db, paymentId, { reason: "policy stop", requestedAt: null });
    expect((await paymentRow(paymentId))?.requestedAt).toBeNull();
  });

  it("cannot release a settled payment", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    const paymentId = await reserved(job, 10_000);
    await settleDownstream(db, paymentId, { txId: "TX1", requestedAt });
    expect(await releaseDownstream(db, paymentId, { reason: "late", requestedAt })).toEqual({
      applied: false,
      current: "SETTLED",
    });
    expect((await jobBooks(db, job.jobId)).counters.settled).toBe(10_000);
  });
});

describe("markDownstreamUnresolved", () => {
  it("moves reserved to unresolved, which keeps counting against the budget", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    const paymentId = await reserved(job, 70_000);
    expect(
      await markDownstreamUnresolved(db, paymentId, { reason: "timeout", requestedAt }),
    ).toEqual({ applied: true, status: "UNRESOLVED" });
    const books = await jobBooks(db, job.jobId);
    expect(books.counters).toEqual({ settled: 0, reserved: 0, unresolved: 70_000 });
    expect(books.sums.unresolved).toBe(70_000);
    expect(await paymentRow(paymentId)).toMatchObject({
      status: "UNRESOLVED",
      resolutionReason: "timeout",
      requestedAt,
    });
    expect(await releaseDownstream(db, paymentId, { reason: "retry", requestedAt })).toEqual({
      applied: false,
      current: "UNRESOLVED",
    });
    expect(await settleDownstream(db, paymentId, { txId: "TX1", requestedAt })).toEqual({
      applied: false,
      current: "UNRESOLVED",
    });
    expect((await jobBooks(db, job.jobId)).counters.unresolved).toBe(70_000);
  });

  it("throws for an unknown payment id", async () => {
    await expect(
      markDownstreamUnresolved(db, "pay_missing", { reason: "timeout", requestedAt }),
    ).rejects.toThrow("pay_missing");
  });
});
