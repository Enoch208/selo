import { describe, expect, it } from "vitest";
import {
  captureOutput,
  catalog,
  jobRow,
  paymentRows,
  runnerWith,
  scheme,
  seedRunnableJob,
  seller,
  useOrchestratorHarness,
} from "./harness";
import { probeNetworkError } from "./stock-seller";

useOrchestratorHarness();
const output = captureOutput();

const statusOf = (report: { checks: readonly { id: string; status: string; code: string }[] }) =>
  Object.fromEntries(report.checks.map((check) => [check.id, `${check.status}:${check.code}`]));

describe("handshake outcomes", () => {
  it("stops after a C1 FAIL: every other check is NOT_RUN and nothing is paid", async () => {
    seller.unpaidOverride = () => new Response("{}", { status: 200 });
    const jobId = await seedRunnableJob();
    const report = await runnerWith().run(jobId);
    expect(report.verdict).toBe("FAIL");
    expect(statusOf(report)).toEqual({
      handshake: "FAIL:NOT_PAYMENT_REQUIRED",
      paid_delivery: "INCONCLUSIVE:NOT_RUN",
      response_contract: "INCONCLUSIVE:NOT_RUN",
      discovery_contract: "INCONCLUSIVE:NOT_RUN",
      retry_safety: "INCONCLUSIVE:NOT_RUN",
    });
    expect(seller.paidRequests()).toEqual([]);
    expect(await paymentRows(jobId)).toEqual([]);
    expect((await jobRow(jobId)).status).toBe("REPORT_WRITTEN");
  });

  it("makes a probe network error INCONCLUSIVE NETWORK_UNAVAILABLE without reserving", async () => {
    seller.unpaidFailure = probeNetworkError();
    const jobId = await seedRunnableJob();
    const report = await runnerWith().run(jobId);
    expect(report).toMatchObject({
      verdict: "INCONCLUSIVE",
      inconclusiveReason: "NETWORK_UNAVAILABLE",
    });
    expect(await paymentRows(jobId)).toEqual([]);
  });

  it("sends no request at all once the job wall clock has expired", async () => {
    const jobId = await seedRunnableJob();
    const report = await runnerWith({ wallClockMs: 1 }).run(jobId);
    expect(report).toMatchObject({ verdict: "INCONCLUSIVE", inconclusiveReason: "TARGET_TIMEOUT" });
    expect(seller.requests).toEqual([]);
  });
});

describe("paid delivery ledger outcomes", () => {
  it("releases the reservation when signing fails and sends nothing paid", async () => {
    scheme.failWith = new Error("algod unreachable");
    const jobId = await seedRunnableJob();
    const report = await runnerWith().run(jobId);
    expect(report.verdict).toBe("INCONCLUSIVE");
    expect(statusOf(report).paid_delivery).toBe("INCONCLUSIVE:NETWORK_UNAVAILABLE");
    expect(seller.paidRequests()).toEqual([]);
    expect((await paymentRows(jobId)).map((row) => row.status)).toEqual(["RELEASED"]);
    expect(await jobRow(jobId)).toMatchObject({ reservedSpendMicros: 0, settledSpendMicros: 0 });
  });

  it("holds a delivered response without a settlement tx id as UNRESOLVED and stops", async () => {
    seller.facilitator.fixedTxId = "";
    const jobId = await seedRunnableJob();
    const report = await runnerWith().run(jobId);
    expect(report).toMatchObject({
      verdict: "INCONCLUSIVE",
      inconclusiveReason: "PAYMENT_UNRESOLVED",
    });
    expect(statusOf(report).paid_delivery).toBe("INCONCLUSIVE:SETTLEMENT_UNCONFIRMED");
    expect(statusOf(report).retry_safety).toBe("INCONCLUSIVE:NOT_RUN");
    expect(seller.paidRequests()).toHaveLength(1);
    const [payment] = await paymentRows(jobId);
    expect(payment).toMatchObject({ status: "UNRESOLVED", txId: null });
    expect(payment?.expectedTxId).toBe(scheme.signedTxIds[0]);
    expect(await jobRow(jobId)).toMatchObject({ unresolvedSpendMicros: 10_000 });
  });

  it("never settles a target tx id that another payment already holds", async () => {
    scheme.opaque = true;
    seller.facilitator.fixedTxId = "SHAREDTARGETTX";
    await runnerWith().run(await seedRunnableJob());
    seller.facilitator.reset();
    seller.facilitator.fixedTxId = "SHAREDTARGETTX";
    const jobId = await seedRunnableJob();
    const report = await runnerWith().run(jobId);
    expect(report).toMatchObject({
      verdict: "INCONCLUSIVE",
      inconclusiveReason: "PAYMENT_UNRESOLVED",
    });
    expect((await paymentRows(jobId)).map((row) => [row.status, row.txId])).toEqual([
      ["UNRESOLVED", null],
    ]);
    expect(output.stderr.join("")).toContain("event=downstream_duplicate_tx");
  });
});

describe("retry safety outcomes", () => {
  it("passes a replay that returns the same settlement", async () => {
    seller.facilitator.replay = "same_tx";
    const report = await runnerWith().run(await seedRunnableJob());
    expect(statusOf(report).retry_safety).toBe("PASS:PASS_SAFE_RETRY");
  });

  it("passes a replay answered with the byte-identical stored result and no new settlement", async () => {
    seller.replayCache = "stored_result";
    const report = await runnerWith().run(await seedRunnableJob());
    expect(statusOf(report).retry_safety).toBe("PASS:PASS_SAFE_RETRY");
    expect(report.verdict).toBe("PASS");
  });

  it("warns on a GET replay answered with a different body and no settlement", async () => {
    seller.replayCache = "fresh_result";
    const report = await runnerWith().run(await seedRunnableJob());
    expect(statusOf(report).retry_safety).toBe("WARN:WARN_NO_IDEMPOTENCY_CONTRACT");
  });

  it("fails and alerts when the replay reports a second settlement", async () => {
    seller.facilitator.replay = "settle_again";
    const jobId = await seedRunnableJob();
    const report = await runnerWith().run(jobId);
    expect(report.verdict).toBe("FAIL");
    expect(statusOf(report).retry_safety).toBe("FAIL:FAIL_DUPLICATE_SIDE_EFFECT");
    expect(output.stderr.join("")).toContain(`event=replay_second_settlement jobId=${jobId}`);
  });
});

describe("infrastructure and internal failures", () => {
  it("makes an unavailable catalog INCONCLUSIVE FACILITATOR_UNAVAILABLE after a settled payment", async () => {
    catalog.mode = "unavailable";
    const jobId = await seedRunnableJob();
    const report = await runnerWith().run(jobId);
    expect(report).toMatchObject({
      verdict: "INCONCLUSIVE",
      inconclusiveReason: "FACILITATOR_UNAVAILABLE",
    });
    expect(statusOf(report).discovery_contract).toBe("INCONCLUSIVE:CATALOG_UNAVAILABLE");
    expect((await paymentRows(jobId)).map((row) => row.status)).toEqual(["SETTLED"]);
  });

  it("turns an unexpected exception into INCONCLUSIVE INTERNAL_ERROR with a written report", async () => {
    catalog.mode = "throws";
    const jobId = await seedRunnableJob();
    const report = await runnerWith().run(jobId);
    expect(report).toMatchObject({ verdict: "INCONCLUSIVE", inconclusiveReason: "INTERNAL_ERROR" });
    expect(await jobRow(jobId)).toMatchObject({
      status: "REPORT_WRITTEN",
      verdict: "INCONCLUSIVE",
    });
    expect(output.stderr.join("")).toContain(`event=internal_error jobId=${jobId}`);
  });
});

describe("structured logs", () => {
  it("writes one JSON object per line with the observability fields and no signature", async () => {
    const jobId = await seedRunnableJob();
    await runnerWith().run(jobId);
    const lines = output.stdout
      .join("")
      .split("\n")
      .filter((line) => line !== "");
    const entries = lines.map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(entries.length).toBeGreaterThan(5);
    for (const entry of entries) {
      expect(Object.keys(entry).sort()).toEqual(
        [
          "amountUsdc",
          "downstreamTxId",
          "durationMs",
          "event",
          "failureCode",
          "incomingTxId",
          "jobId",
          "operationId",
          "requestId",
          "scenarioId",
          "status",
          "targetOrigin",
        ].sort(),
      );
      expect(entry.jobId).toBe(jobId);
    }
    expect(entries.map((entry) => entry.event)).toContain("downstream_settled");
    const signature = seller.paidRequests()[0]?.signature ?? "missing";
    expect(output.stdout.join("")).not.toContain(signature);
  });
});
