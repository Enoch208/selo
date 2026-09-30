import { describe, expect, it } from "vitest";
import { buildReport } from "../../src/reports/build";
import { db } from "../support";
import {
  captureOutput,
  evidenceRows,
  jobRow,
  paymentRows,
  runnerWith,
  scheme,
  seedRunnableJob,
  seller,
  useOrchestratorHarness,
  wallet,
} from "./harness";

useOrchestratorHarness();
const output = captureOutput();

const statusOf = (report: { checks: readonly { id: string; status: string; code: string }[] }) =>
  Object.fromEntries(report.checks.map((check) => [check.id, `${check.status}:${check.code}`]));

describe("C2 settlement tx id is checked against Selo's own signed transaction", () => {
  it("holds a target-claimed tx id that differs from the signed one and stops spending", async () => {
    seller.facilitator.fixedTxId = "FORGEDTARGETTX";
    const jobId = await seedRunnableJob();
    const report = await runnerWith().run(jobId);

    expect(report).toMatchObject({
      verdict: "INCONCLUSIVE",
      inconclusiveReason: "PAYMENT_UNRESOLVED",
    });
    expect(statusOf(report).paid_delivery).toBe("INCONCLUSIVE:SETTLEMENT_TX_MISMATCH");
    expect(statusOf(report).retry_safety).toBe("INCONCLUSIVE:NOT_RUN");
    expect(report.money.downstreamTxIds).toEqual([]);
    const [payment] = await paymentRows(jobId);
    expect(payment).toMatchObject({
      status: "UNRESOLVED",
      txId: null,
      expectedTxId: scheme.signedTxIds[0],
    });
    expect(payment?.resolutionReason).toContain("FORGEDTARGETTX");
    const full = await buildReport(db, jobId);
    expect(full.observedResponse?.txId).toBeNull();
    expect(full.money.payments).toEqual([
      { status: "UNRESOLVED", amountUsdc: "0.01", txId: null, expectedTxId: scheme.signedTxIds[0] },
    ]);
    const paid = (await evidenceRows(jobId)).find((row) => row.kind === "paid_response");
    expect(paid?.sanitizedJson).toMatchObject({
      settlementTxCheck: "mismatch",
      claimedTxId: "FORGEDTARGETTX",
      txId: null,
    });
    expect(await jobRow(jobId)).toMatchObject({
      settledSpendMicros: 0,
      unresolvedSpendMicros: 10_000,
    });
    expect(seller.paidRequests()).toHaveLength(1);
    expect(output.stderr.join("")).toContain(
      `event=downstream_settlement_tx_mismatch jobId=${jobId}`,
    );
  });

  it("settles the target's tx id as before when it equals the signed transaction", async () => {
    const jobId = await seedRunnableJob();
    const report = await runnerWith().run(jobId);
    expect(statusOf(report).paid_delivery).toBe("PASS:PAID_AND_DELIVERED");
    const [payment] = await paymentRows(jobId);
    expect(payment).toMatchObject({ status: "SETTLED", txId: scheme.signedTxIds[0] });
    const paid = (await evidenceRows(jobId)).find((row) => row.kind === "paid_response");
    expect(paid?.sanitizedJson).toMatchObject({ settlementTxCheck: "matched" });
  });

  it("settles the claimed tx id and records that it could not be checked when the expected id is unavailable", async () => {
    scheme.opaque = true;
    const jobId = await seedRunnableJob();
    const report = await runnerWith().run(jobId);
    expect(statusOf(report).paid_delivery).toBe("PASS:PAID_AND_DELIVERED");
    const [payment] = await paymentRows(jobId);
    expect(payment).toMatchObject({ status: "SETTLED", txId: "TARGETTX1", expectedTxId: null });
    const paid = (await evidenceRows(jobId)).find((row) => row.kind === "paid_response");
    expect(paid?.sanitizedJson).toMatchObject({ settlementTxCheck: "expected_unavailable" });
  });
});

describe("Selo's operating wallet is checked before anything is signed", () => {
  it.each([
    ["USDC below the price", () => (wallet.usdcMicros = 9_999n), /USDC balance 0.009999 is below/],
    ["not opted in to USDC", () => (wallet.usdcOptedIn = false), /not opted in/],
    [
      "ALGO below minimum balance",
      () => (wallet.algoMicros = 100_000n),
      /ALGO balance 0.10 is below/,
    ],
  ])(
    "%s: nothing signed, C2 OPERATOR_WALLET_UNFUNDED, job INTERNAL_ERROR",
    async (_, arrange, detail) => {
      arrange();
      const jobId = await seedRunnableJob();
      const report = await runnerWith().run(jobId);

      expect(report).toMatchObject({
        verdict: "INCONCLUSIVE",
        inconclusiveReason: "INTERNAL_ERROR",
      });
      expect(statusOf(report).paid_delivery).toBe("INCONCLUSIVE:OPERATOR_WALLET_UNFUNDED");
      expect(report.checks.find((check) => check.id === "paid_delivery")?.summary).toMatch(detail);
      expect(scheme.signedTxIds).toEqual([]);
      expect(seller.paidRequests()).toEqual([]);
      expect(await paymentRows(jobId)).toEqual([]);
      expect(output.stderr.join("")).toContain(`ALERT event=operator_wallet_low jobId=${jobId}`);
    },
  );

  it("an unreachable algod is NETWORK_UNAVAILABLE and nothing is signed", async () => {
    wallet.failure = new Error("connect ETIMEDOUT");
    const jobId = await seedRunnableJob();
    const report = await runnerWith().run(jobId);

    expect(report).toMatchObject({
      verdict: "INCONCLUSIVE",
      inconclusiveReason: "NETWORK_UNAVAILABLE",
    });
    expect(statusOf(report).paid_delivery).toBe("INCONCLUSIVE:NETWORK_UNAVAILABLE");
    expect(scheme.signedTxIds).toEqual([]);
    expect(await paymentRows(jobId)).toEqual([]);
    expect(output.stderr.join("")).toContain(
      `ALERT event=operator_wallet_unreachable jobId=${jobId}`,
    );
  });

  it("a funded wallet is read once and the job pays as usual", async () => {
    const report = await runnerWith().run(await seedRunnableJob());
    expect(report.verdict).toBe("PASS");
    expect(wallet.reads).toBe(1);
  });
});

describe("a 402 after signing", () => {
  it.each([
    ["verify", "invalid_exact_avm_simulation_failed"],
    ["verify", "invalid_exact_avm_invalid_signature"],
    ["settle", "insufficient_funds"],
  ] as const)(
    "with payer-side %s reason %s is INCONCLUSIVE PAYER_REJECTED and held UNRESOLVED",
    async (phase, reason) => {
      if (phase === "verify") {
        seller.facilitator.verifyInvalidReason = reason;
      } else {
        seller.facilitator.rejectFirstSettle = true;
        seller.facilitator.settleFailureReason = reason;
      }
      const jobId = await seedRunnableJob();
      const report = await runnerWith().run(jobId);

      expect(report).toMatchObject({
        verdict: "INCONCLUSIVE",
        inconclusiveReason: "PAYMENT_UNRESOLVED",
      });
      expect(statusOf(report).paid_delivery).toBe("INCONCLUSIVE:PAYER_REJECTED");
      expect((await paymentRows(jobId)).map((row) => row.status)).toEqual(["UNRESOLVED"]);
    },
  );

  it("with a genuine target-side reason stays FAIL PAID_REQUEST_REJECTED", async () => {
    seller.facilitator.verifyInvalidReason = "invalid_exact_avm_receiver_mismatch";
    const jobId = await seedRunnableJob();
    const report = await runnerWith().run(jobId);

    expect(report.verdict).toBe("FAIL");
    expect(statusOf(report).paid_delivery).toBe("FAIL:PAID_REQUEST_REJECTED");
    expect((await paymentRows(jobId)).map((row) => row.status)).toEqual(["UNRESOLVED"]);
  });
});
