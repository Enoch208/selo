import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { downstreamPayments } from "../../src/db/schema";
import { jobBooks } from "../../src/ledger/books";
import { reserveDownstream, ScenarioNotInJob } from "../../src/ledger/reserve";
import { markDownstreamUnresolved } from "../../src/ledger/transitions";
import { db, resetDatabaseBetweenTests } from "../support";
import { now, origin, reserveInput, seedJob } from "./fixtures";

resetDatabaseBetweenTests();

describe("reserveDownstream", () => {
  it("reserves capacity and inserts a RESERVED payment in one step", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    const result = await reserveDownstream(db, reserveInput(job, 40_000));
    expect(result.reserved).toBe(true);
    if (!result.reserved) {
      return;
    }
    const [payment] = await db
      .select()
      .from(downstreamPayments)
      .where(eq(downstreamPayments.id, result.paymentId));
    expect(payment).toMatchObject({
      jobId: job.jobId,
      scenarioId: job.scenarioIds[0],
      status: "RESERVED",
      amountMicros: 40_000,
      targetOrigin: origin,
      network: "algorand-testnet",
      assetId: "10458941",
      payTo: "PAYTOADDRESS",
      paymentRequirementsHash: "b".repeat(64),
      txId: null,
      requestedAt: null,
    });
    const books = await jobBooks(db, job.jobId);
    expect(books.counters).toEqual({ settled: 0, reserved: 40_000, unresolved: 0 });
    expect(books.sums).toEqual({ settled: 0, reserved: 40_000, unresolved: 0, released: 0 });
    expect(books.maxSpendMicros).toBe(100_000);
  });

  it("allows a reservation that fills the budget exactly and denies one micro more", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    expect((await reserveDownstream(db, reserveInput(job, 100_000))).reserved).toBe(true);
    expect(await reserveDownstream(db, reserveInput(job, 1))).toEqual({
      reserved: false,
      reason: "JOB_BUDGET_EXCEEDED",
    });
  });

  it("rejects a scenario that belongs to another job without reserving", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    const other = await seedJob({ maxSpendMicros: 100_000 });
    const foreign = reserveInput(job, 10_000, { scenarioId: other.scenarioIds[0] ?? "" });
    await expect(reserveDownstream(db, foreign)).rejects.toBeInstanceOf(ScenarioNotInJob);
    await expect(
      reserveDownstream(db, reserveInput(job, 10_000, { scenarioId: "scn_missing" })),
    ).rejects.toBeInstanceOf(ScenarioNotInJob);
    expect((await jobBooks(db, job.jobId)).counters.reserved).toBe(0);
    expect((await jobBooks(db, job.jobId)).sums.reserved).toBe(0);
  });

  it("rejects a non-positive amount before touching the database", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    await expect(reserveDownstream(db, reserveInput(job, 0))).rejects.toThrow(RangeError);
    expect((await jobBooks(db, job.jobId)).counters.reserved).toBe(0);
  });
});

describe("denial reasons surface in guard order", () => {
  const expired = { status: "VERIFIED" as const, origin, expiresAt: now };

  it("authorization missing, unverified, then expired", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    const denials = await Promise.all([
      reserveDownstream(db, reserveInput(job, 10_000, { authorization: null })),
      reserveDownstream(
        db,
        reserveInput(job, 10_000, { authorization: { ...expired, status: "REVOKED" } }),
      ),
      reserveDownstream(db, reserveInput(job, 10_000, { authorization: expired })),
    ]);
    expect(denials).toEqual([
      { reserved: false, reason: "AUTHORIZATION_INVALID" },
      { reserved: false, reason: "AUTHORIZATION_INVALID" },
      { reserved: false, reason: "AUTHORIZATION_EXPIRED" },
    ]);
  });

  it("expired authorization wins over every later failure", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    const input = reserveInput(job, 200_000, {
      authorization: expired,
      allowedNetwork: "algorand-mainnet",
      allowedAsset: "31566704",
      scenarioMaxSpendMicros: 1,
    });
    expect(await reserveDownstream(db, input)).toEqual({
      reserved: false,
      reason: "AUTHORIZATION_EXPIRED",
    });
  });

  it("job not running, origin, network, asset in order", async () => {
    const stopped = await seedJob({ maxSpendMicros: 100_000, status: "QUEUED" });
    const job = await seedJob({ maxSpendMicros: 100_000 });
    const elsewhere = { ...reserveInput(job, 10_000).payment, origin: "https://evil.example" };
    const results = await Promise.all([
      reserveDownstream(db, reserveInput(stopped, 10_000, { payment: elsewhere })),
      reserveDownstream(
        db,
        reserveInput(job, 10_000, { payment: elsewhere, allowedNetwork: "algorand-mainnet" }),
      ),
      reserveDownstream(
        db,
        reserveInput(job, 10_000, { allowedNetwork: "algorand-mainnet", allowedAsset: "1" }),
      ),
      reserveDownstream(db, reserveInput(job, 10_000, { allowedAsset: "31566704" })),
    ]);
    expect(results.map((result) => (result.reserved ? "reserved" : result.reason))).toEqual([
      "JOB_NOT_RUNNING",
      "ORIGIN_NOT_AUTHORIZED",
      "NETWORK_NOT_ALLOWED",
      "ASSET_NOT_ALLOWED",
    ]);
  });

  it("an outstanding unresolved payment blocks before scenario and job budgets", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    const first = await reserveDownstream(db, reserveInput(job, 10_000));
    if (!first.reserved) {
      throw new Error("seed reservation was denied");
    }
    await markDownstreamUnresolved(db, first.paymentId, {
      reason: "timeout",
      requestedAt: now,
    });
    const blocked = await reserveDownstream(
      db,
      reserveInput(job, 500_000, { scenarioMaxSpendMicros: 1 }),
    );
    expect(blocked).toEqual({ reserved: false, reason: "PAYMENT_UNRESOLVED" });
  });

  it("scenario max, then job budget, then absolute cap", async () => {
    const job = await seedJob({ maxSpendMicros: 100_000 });
    const results = await Promise.all([
      reserveDownstream(
        db,
        reserveInput(job, 200_000, { scenarioMaxSpendMicros: 50_000, absoluteCapMicros: 1 }),
      ),
      reserveDownstream(db, reserveInput(job, 200_000, { absoluteCapMicros: 1 })),
      reserveDownstream(db, reserveInput(job, 10_000, { absoluteCapMicros: 50_000 })),
    ]);
    expect(results.map((result) => (result.reserved ? "reserved" : result.reason))).toEqual([
      "SCENARIO_BUDGET_EXCEEDED",
      "JOB_BUDGET_EXCEEDED",
      "ABSOLUTE_CAP_EXCEEDED",
    ]);
    expect((await jobBooks(db, job.jobId)).counters.reserved).toBe(0);
  });
});
