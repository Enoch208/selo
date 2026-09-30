import { checkIds } from "@selo/core";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { releaseJobs } from "../../src/db/schema";
import { JobNotRunnable } from "../../src/orchestrator/job-state";
import {
  captureOutput,
  jobRow,
  paymentRows,
  runnerWith,
  scenarioRows,
  scheme,
  seedRunnableJob,
  seller,
  useOrchestratorHarness,
} from "./harness";
import { targetOrigin } from "./stock-seller";
import { db } from "../support";

useOrchestratorHarness();
captureOutput();

describe("createJobRunner happy path", () => {
  it("runs the five checks against a stock x402 seller and passes it", async () => {
    const jobId = await seedRunnableJob();
    const report = await runnerWith().run(jobId);

    expect(report.verdict).toBe("PASS");
    expect(report.inconclusiveReason).toBeNull();
    expect(report.checks.map((check) => check.id)).toEqual([...checkIds]);
    expect(report.checks.map((check) => [check.id, check.status, check.code])).toEqual([
      ["handshake", "PASS", "HANDSHAKE_VALID"],
      ["paid_delivery", "PASS", "PAID_AND_DELIVERED"],
      ["response_contract", "PASS", "CONTRACT_MATCHED"],
      ["discovery_contract", "PASS", "DISCOVERY_CONSISTENT"],
      ["retry_safety", "PASS", "PASS_REPLAY_REJECTED"],
    ]);
    expect(report.money).toEqual({
      seloInboundTxId: `INBOUND${jobId}`,
      downstreamSpendUsdc: "0.01",
      downstreamTxIds: [scheme.signedTxIds[0]],
    });
    expect(report.reportUrl).toMatch(
      /^https:\/\/selo\.example\/api\/v1\/reports\/[A-Za-z0-9_-]{43}$/,
    );

    const job = await jobRow(jobId);
    expect(job).toMatchObject({
      status: "REPORT_WRITTEN",
      verdict: "PASS",
      settledSpendMicros: 10_000,
      reservedSpendMicros: 0,
      unresolvedSpendMicros: 0,
    });
    expect(job.startedAt).toBeInstanceOf(Date);
    expect(job.completedAt).toBeInstanceOf(Date);
  });

  it("keeps one scenario row per check with a stable operation id and recorded attempts", async () => {
    const jobId = await seedRunnableJob();
    await runnerWith().run(jobId);
    const rows = await scenarioRows(jobId);
    expect(rows.map((row) => row.scenarioKey).sort()).toEqual([...checkIds].sort());
    for (const row of rows) {
      expect(row.operationId).toBe(`${jobId}:${row.scenarioKey}`);
      expect(row.status).toBe("EVALUATED");
      expect(row.blocking).toBe(true);
      expect(row.completedAt).toBeInstanceOf(Date);
      expect(row.observedJson).toMatchObject({ check: { id: row.scenarioKey } });
    }
    const attempts = Object.fromEntries(rows.map((row) => [row.scenarioKey, row.attemptCount]));
    expect(attempts).toMatchObject({ handshake: 1, paid_delivery: 1, retry_safety: 1 });
  });

  it("pays once through the paid instance, replays with the C2 operation id and persists the tx ids", async () => {
    const jobId = await seedRunnableJob();
    await runnerWith().run(jobId);

    expect(seller.requests.map((request) => [request.paid, request.timeoutMs])).toEqual([
      [false, 10_000],
      [true, 20_000],
      [true, 20_000],
    ]);
    expect(seller.requests.every((request) => request.allowedOrigin === targetOrigin)).toBe(true);
    const [paid, replay] = seller.paidRequests();
    expect(paid?.idempotencyKey).toBe(`${jobId}:paid_delivery`);
    expect(replay?.idempotencyKey).toBe(`${jobId}:paid_delivery`);
    expect(replay?.signature).toBe(paid?.signature);
    expect(seller.facilitator.settled).toHaveLength(1);

    const [payment] = await paymentRows(jobId);
    expect(payment).toMatchObject({
      status: "SETTLED",
      txId: scheme.signedTxIds[0],
      expectedTxId: scheme.signedTxIds[0],
      amountMicros: 10_000,
      targetOrigin,
    });
    expect(payment?.requestedAt).toBeInstanceOf(Date);
  });

  it("answers result() with the same report once written and null before", async () => {
    const jobId = await seedRunnableJob();
    const runner = runnerWith();
    expect(await runner.result(jobId)).toBeNull();
    const report = await runner.run(jobId);
    expect(await runner.result(jobId)).toEqual(report);
  });
});

describe("createJobRunner entry guard", () => {
  it("refuses a job whose inbound payment has not settled and contacts no target", async () => {
    const jobId = await seedRunnableJob({ status: "READY" });
    await expect(runnerWith().run(jobId)).rejects.toBeInstanceOf(JobNotRunnable);
    expect(seller.requests).toEqual([]);
    expect((await jobRow(jobId)).status).toBe("READY");
  });

  it("refuses an INBOUND_SETTLED row that carries no inbound settlement time", async () => {
    const jobId = await seedRunnableJob();
    await db.update(releaseJobs).set({ incomingSettledAt: null }).where(eq(releaseJobs.id, jobId));
    await expect(runnerWith().run(jobId)).rejects.toBeInstanceOf(JobNotRunnable);
    expect(seller.requests).toEqual([]);
    expect((await jobRow(jobId)).status).toBe("INBOUND_SETTLED");
  });

  it("refuses to run the same job twice", async () => {
    const jobId = await seedRunnableJob();
    const runner = runnerWith();
    await runner.run(jobId);
    await expect(runner.run(jobId)).rejects.toBeInstanceOf(JobNotRunnable);
    expect(seller.paidRequests()).toHaveLength(2);
  });
});
