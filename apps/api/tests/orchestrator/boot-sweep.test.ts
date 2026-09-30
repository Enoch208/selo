import { existsSync } from "node:fs";
import { join } from "node:path";
import type { JobStatus } from "@selo/core";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downstreamPayments, releaseJobs, scenarios } from "../../src/db/schema";
import { recordEvidence } from "../../src/evidence/record";
import { reserveDownstream } from "../../src/ledger/reserve";
import {
  scheduleResweep,
  sweepGraceMs,
  sweepStrandedJobs,
} from "../../src/orchestrator/boot-sweep";
import { planScenarios } from "../../src/orchestrator/scenario";
import { reportToken } from "../../src/reports/token";
import { app, db } from "../support";
import {
  captureOutput,
  jobRow,
  paymentRows,
  reportTokenSecret,
  reportsDir,
  runnerDeps,
  scenarioRows,
  seedRunnableJob,
  useOrchestratorHarness,
} from "./harness";
import { targetNetwork, targetOrigin, targetPayTo, targetUrl } from "./stock-seller";

useOrchestratorHarness();
const output = captureOutput();

const wallClockMs = 60_000;
const deps = () => runnerDeps({ wallClockMs });
const later = (ms: number) => new Date(Date.now() + ms);

type ContractFailure = "none" | "with_evidence" | "without_evidence";

async function strandedMidPayment(
  status: JobStatus = "RUNNING",
  contractFailure: ContractFailure = "none",
): Promise<string> {
  const jobId = await seedRunnableJob();
  const set = await planScenarios(
    { db, jobId, targetOrigin },
    {
      handshake: { url: targetUrl },
      paid_delivery: {},
      response_contract: {},
      discovery_contract: {},
      retry_safety: {},
    },
  );
  await db.update(releaseJobs).set({ status: "RUNNING" }).where(eq(releaseJobs.id, jobId));
  const now = new Date();
  const reserved = await reserveDownstream(db, {
    jobId,
    scenarioId: set.paid_delivery.id,
    authorization: { status: "VERIFIED", origin: targetOrigin, expiresAt: later(3_600_000) },
    payment: {
      origin: targetOrigin,
      network: targetNetwork.caip2,
      asset: targetNetwork.usdcAssetId,
      amountMicros: 10_000,
      payTo: targetPayTo,
      requirementsHash: "b".repeat(64),
    },
    scenarioMaxSpendMicros: 500_000,
    absoluteCapMicros: 5_000_000,
    allowedNetwork: targetNetwork.caip2,
    allowedAsset: targetNetwork.usdcAssetId,
    now,
  });
  expect(reserved.reserved).toBe(true);
  await set.paid_delivery.advance("POLICY_CHECKED");
  await set.paid_delivery.advance("RESERVED");
  await set.paid_delivery.advance("REQUESTING");
  if (contractFailure !== "none") {
    const evidenceIds =
      contractFailure === "with_evidence"
        ? [
            await recordEvidence(db, {
              jobId,
              scenarioId: set.response_contract.id,
              kind: "response_contract",
              value: { observedStatus: 500, expectedStatus: 200 },
            }),
          ]
        : [];
    await set.response_contract.evaluate(
      {
        id: "response_contract",
        status: "FAIL",
        code: "STATUS_MISMATCH",
        blocking: true,
        summary: "Expected 200, observed 500.",
        evidence: evidenceIds,
      },
      { status: 500 },
    );
  }
  await db.update(releaseJobs).set({ status }).where(eq(releaseJobs.id, jobId));
  return jobId;
}

describe("boot sweep of jobs stranded by a restart", () => {
  it("holds an open reservation UNRESOLVED, concludes the job INCONCLUSIVE and writes its report", async () => {
    const jobId = await strandedMidPayment();
    await sweepStrandedJobs(deps(), later(2 * wallClockMs));

    expect(await jobRow(jobId)).toMatchObject({
      status: "REPORT_WRITTEN",
      verdict: "INCONCLUSIVE",
      inconclusiveReason: "INTERNAL_ERROR",
      reservedSpendMicros: 0,
      unresolvedSpendMicros: 10_000,
    });
    const [payment] = await paymentRows(jobId);
    expect(payment?.status).toBe("UNRESOLVED");
    expect(payment?.resolutionReason).toMatch(/restart/);
    const rows = await scenarioRows(jobId);
    expect(rows.every((row) => row.status === "EVALUATED")).toBe(true);
    expect(rows.find((row) => row.scenarioKey === "paid_delivery")?.failureCode).toBe(
      "INTERNAL_ERROR",
    );
    const response = await app.request(`/v1/reports/${reportToken(reportTokenSecret, jobId)}`);
    expect(response.status).toBe(200);
    expect(existsSync(join(reportsDir, jobId, "evidence.json"))).toBe(true);
    expect(output.stderr.join("")).toContain(`ALERT event=job_swept_after_restart jobId=${jobId}`);
  });

  it.each(["INBOUND_SETTLED", "QUEUED", "RUNNING_PREFLIGHT_RECHECK", "ANALYZING"] as const)(
    "also concludes a job stranded in %s",
    async (status) => {
      const jobId =
        status === "INBOUND_SETTLED" ? await seedRunnableJob() : await strandedMidPayment(status);
      await sweepStrandedJobs(deps(), later(2 * wallClockMs));
      expect(await jobRow(jobId)).toMatchObject({
        status: "REPORT_WRITTEN",
        verdict: "INCONCLUSIVE",
        inconclusiveReason: "INTERNAL_ERROR",
        reservedSpendMicros: 0,
      });
    },
  );

  it("leaves a job younger than the wall clock alone", async () => {
    const jobId = await strandedMidPayment();
    await sweepStrandedJobs(deps(), new Date());
    expect((await jobRow(jobId)).status).toBe("RUNNING");
    expect((await paymentRows(jobId)).map((row) => row.status)).toEqual(["RESERVED"]);
    expect(output.stderr.join("")).not.toContain("job_swept_after_restart");
  });

  it("leaves finished jobs alone", async () => {
    const jobId = await seedRunnableJob();
    await db
      .update(releaseJobs)
      .set({ status: "REPORT_WRITTEN", verdict: "PASS" })
      .where(eq(releaseJobs.id, jobId));
    await sweepStrandedJobs(deps(), later(10 * wallClockMs));
    expect(await jobRow(jobId)).toMatchObject({ status: "REPORT_WRITTEN", verdict: "PASS" });
  });

  it("marks a READY job whose settlement never completed FACILITATOR_UNAVAILABLE without touching money", async () => {
    const jobId = await seedRunnableJob({ status: "READY" });
    await sweepStrandedJobs(deps(), later(10 * 60_000));
    expect(await jobRow(jobId)).toMatchObject({
      status: "INCONCLUSIVE",
      inconclusiveReason: "FACILITATOR_UNAVAILABLE",
      incomingTxId: null,
      incomingSettledAt: null,
      reportTokenHash: null,
    });
    expect(await db.select().from(downstreamPayments)).toEqual([]);
    expect(output.stderr.join("")).toContain(
      `ALERT event=ready_job_swept_after_restart jobId=${jobId}`,
    );
  });

  it("leaves a READY job that may still be settling alone", async () => {
    const jobId = await seedRunnableJob({ status: "READY" });
    await sweepStrandedJobs(deps(), later(30_000));
    expect((await jobRow(jobId)).status).toBe("READY");
  });

  it("does not create scenarios for a job that never planned any", async () => {
    const jobId = await seedRunnableJob();
    await sweepStrandedJobs(deps(), later(2 * wallClockMs));
    expect(await db.select().from(scenarios).where(eq(scenarios.jobId, jobId))).toEqual([]);
  });

  it.each(["RUNNING", "ANALYZING"] as const)(
    "reduces a job stranded in %s with an evidence-backed blocking FAIL to FAIL",
    async (status) => {
      const jobId = await strandedMidPayment(status, "with_evidence");
      await sweepStrandedJobs(deps(), later(2 * wallClockMs));
      expect(await jobRow(jobId)).toMatchObject({
        status: "REPORT_WRITTEN",
        verdict: "FAIL",
        inconclusiveReason: null,
        unresolvedSpendMicros: 10_000,
      });
    },
  );

  it("keeps a FAIL without evidence INCONCLUSIVE INTERNAL_ERROR", async () => {
    const jobId = await strandedMidPayment("ANALYZING", "without_evidence");
    await sweepStrandedJobs(deps(), later(2 * wallClockMs));
    expect(await jobRow(jobId)).toMatchObject({
      verdict: "INCONCLUSIVE",
      inconclusiveReason: "INTERNAL_ERROR",
    });
  });

  it("leaves a job inside the wall clock plus the grace margin alone", async () => {
    const jobId = await strandedMidPayment();
    await sweepStrandedJobs(deps(), later(wallClockMs + sweepGraceMs - 5_000));
    expect((await jobRow(jobId)).status).toBe("RUNNING");
  });

  it("completes the report of a job that reached its verdict but crashed before writing it", async () => {
    const jobId = await strandedMidPayment("RUNNING", "with_evidence");
    await db
      .update(releaseJobs)
      .set({ status: "FAIL", verdict: "FAIL" })
      .where(eq(releaseJobs.id, jobId));
    await sweepStrandedJobs(deps(), later(2 * wallClockMs));
    expect(await jobRow(jobId)).toMatchObject({ status: "REPORT_WRITTEN", verdict: "FAIL" });
    const response = await app.request(`/v1/reports/${reportToken(reportTokenSecret, jobId)}`);
    expect(response.status).toBe(200);
    expect(output.stderr.join("")).toContain(
      `ALERT event=job_report_completed_after_restart jobId=${jobId}`,
    );
  });

  it("does not write a report for a held unresolved inbound job", async () => {
    const jobId = await seedRunnableJob({ status: "READY" });
    await db
      .update(releaseJobs)
      .set({ status: "INCONCLUSIVE", inconclusiveReason: "FACILITATOR_UNAVAILABLE" })
      .where(eq(releaseJobs.id, jobId));
    await sweepStrandedJobs(deps(), later(10 * 60_000));
    expect(await jobRow(jobId)).toMatchObject({ status: "INCONCLUSIVE", reportTokenHash: null });
  });

  it("is idempotent: a second sweep changes nothing and alerts nothing", async () => {
    const stranded = await strandedMidPayment();
    const ready = await seedRunnableJob({ status: "READY" });
    await sweepStrandedJobs(deps(), later(10 * 60_000));
    const before = [await jobRow(stranded), await jobRow(ready), await paymentRows(stranded)];
    output.stderr.length = 0;
    await sweepStrandedJobs(deps(), later(10 * 60_000));
    expect([await jobRow(stranded), await jobRow(ready), await paymentRows(stranded)]).toEqual(
      before,
    );
    expect(output.stderr.join("")).not.toContain("ALERT");
  });
});

describe("scheduled re-sweep after boot", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sweeps a job that was too young at boot once the wall clock and grace margin have passed", async () => {
    const jobId = await strandedMidPayment();
    const shortClock = runnerDeps({ wallClockMs: 1_000 });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    await sweepStrandedJobs(shortClock, new Date());
    expect((await jobRow(jobId)).status).toBe("RUNNING");

    const finished = scheduleResweep(shortClock);
    await vi.advanceTimersByTimeAsync(1_000 + sweepGraceMs - 1);
    expect((await jobRow(jobId)).status).toBe("RUNNING");
    await vi.advanceTimersByTimeAsync(2);
    await finished;
    expect(await jobRow(jobId)).toMatchObject({
      status: "REPORT_WRITTEN",
      verdict: "INCONCLUSIVE",
    });
    expect((await paymentRows(jobId)).map((row) => row.status)).toEqual(["UNRESOLVED"]);
  });
});
