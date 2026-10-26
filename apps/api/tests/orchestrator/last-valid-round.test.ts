import { describe, expect, it } from "vitest";
import {
  captureOutput,
  paymentRows,
  runnerWith,
  scheme,
  seedRunnableJob,
  seller,
  useOrchestratorHarness,
} from "./harness";

useOrchestratorHarness();
captureOutput();

const signedLastValid = 2_000;

describe("the signer path records each signed payment's last valid round", () => {
  it("stores it beside the expected tx id when the outcome is left UNRESOLVED", async () => {
    seller.facilitator.fixedTxId = "";
    const jobId = await seedRunnableJob();
    await runnerWith().run(jobId);
    expect(await paymentRows(jobId)).toMatchObject([
      {
        status: "UNRESOLVED",
        expectedTxId: scheme.signedTxIds[0],
        lastValidRound: signedLastValid,
      },
    ]);
  });

  it("stores it on a payment that settled normally", async () => {
    const jobId = await seedRunnableJob();
    await runnerWith().run(jobId);
    expect(await paymentRows(jobId)).toMatchObject([
      { status: "SETTLED", txId: scheme.signedTxIds[0], lastValidRound: signedLastValid },
    ]);
  });

  it("stores nothing when the signed payload is not an AVM payment group", async () => {
    scheme.opaque = true;
    const jobId = await seedRunnableJob();
    await runnerWith().run(jobId);
    const [payment] = await paymentRows(jobId);
    expect(payment).toMatchObject({ expectedTxId: null, lastValidRound: null });
  });
});
