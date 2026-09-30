import { describe, expect, it } from "vitest";
import {
  captureOutput,
  jobRow,
  paymentRows,
  runnerWith,
  scheme,
  seedRunnableJob,
  seller,
  useOrchestratorHarness,
} from "./harness";
import { targetNetwork, targetPayTo, targetUrl } from "./stock-seller";

useOrchestratorHarness();
captureOutput();

const bareChallenge = Buffer.from(
  JSON.stringify({
    x402Version: 2,
    resource: { url: targetUrl, description: "A paid price quote", mimeType: "application/json" },
    accepts: [
      {
        scheme: "exact",
        network: targetNetwork.caip2,
        asset: targetNetwork.usdcAssetId,
        amount: "10000",
        payTo: targetPayTo,
      },
    ],
  }),
).toString("base64");

describe("a live requirement the x402 client cannot take", () => {
  it("releases the reservation, signs nothing and reports REQUIREMENT_NOT_PAYABLE", async () => {
    seller.unpaidOverride = () =>
      new Response("{}", { status: 402, headers: { "PAYMENT-REQUIRED": bareChallenge } });
    const jobId = await seedRunnableJob();
    const report = await runnerWith().run(jobId);
    expect(report.verdict).toBe("INCONCLUSIVE");
    expect(report.checks.find((check) => check.id === "paid_delivery")?.code).toBe(
      "REQUIREMENT_NOT_PAYABLE",
    );
    expect(scheme.signedTxIds).toEqual([]);
    expect(seller.paidRequests()).toEqual([]);
    expect((await paymentRows(jobId)).map((row) => row.status)).toEqual(["RELEASED"]);
    expect(await jobRow(jobId)).toMatchObject({ reservedSpendMicros: 0, settledSpendMicros: 0 });
  });
});
