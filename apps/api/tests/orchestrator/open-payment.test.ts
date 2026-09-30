import { describe, expect, it, vi } from "vitest";
import {
  captureOutput,
  jobRow,
  paymentRows,
  runnerWith,
  seedRunnableJob,
  seller,
  useOrchestratorHarness,
} from "./harness";

vi.mock("../../src/ledger/transitions", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/ledger/transitions")>();
  return {
    ...original,
    settleDownstream: () => Promise.reject(new Error("connection terminated unexpectedly")),
  };
});

useOrchestratorHarness();
const output = captureOutput();

describe("an exception while a payment is open", () => {
  it("marks the open payment UNRESOLVED, stops spending and still writes the report", async () => {
    const jobId = await seedRunnableJob();
    const report = await runnerWith().run(jobId);
    expect(report).toMatchObject({ verdict: "INCONCLUSIVE", inconclusiveReason: "INTERNAL_ERROR" });
    expect((await paymentRows(jobId)).map((row) => row.status)).toEqual(["UNRESOLVED"]);
    expect(await jobRow(jobId)).toMatchObject({
      status: "REPORT_WRITTEN",
      reservedSpendMicros: 0,
      unresolvedSpendMicros: 10_000,
    });
    expect(seller.paidRequests()).toHaveLength(1);
    expect(output.stderr.join("")).toContain(`event=internal_error jobId=${jobId}`);
  });
});
