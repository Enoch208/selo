import { describe, expect, it } from "vitest";
import { targetAuthorizations } from "../../src/db/schema";
import { db } from "../support";
import {
  captureOutput,
  catalog,
  evidenceRows,
  jobRow,
  paymentRows,
  runnerWith,
  scheme,
  seedRunnableJob,
  seller,
  useOrchestratorHarness,
} from "./harness";

useOrchestratorHarness();
const output = captureOutput();

const codeOf = (checks: readonly { id: string; status: string; code: string }[], id: string) => {
  const check = checks.find((entry) => entry.id === id);
  return `${check?.status ?? "missing"}:${check?.code ?? "missing"}`;
};

describe("verdict after an internal error", () => {
  it("keeps a proven FAIL when a later step throws", async () => {
    catalog.mode = "throws";
    const jobId = await seedRunnableJob({
      expected: {
        jsonSchema: {
          type: "object",
          required: ["expiresAt"],
          properties: { expiresAt: { type: "string" } },
        },
      },
    });
    const report = await runnerWith().run(jobId);
    expect(report).toMatchObject({ verdict: "FAIL", inconclusiveReason: null });
    expect(codeOf(report.checks, "response_contract")).toBe("FAIL:SCHEMA_MISMATCH");
    expect(await jobRow(jobId)).toMatchObject({ status: "REPORT_WRITTEN", verdict: "FAIL" });
    expect(output.stderr.join("")).toContain(`event=internal_error jobId=${jobId}`);
  });
});

describe("authorization before the C3 replay", () => {
  it("does not replay when the authorization lapsed after the paid call", async () => {
    seller.onPaid = async () => {
      await db.update(targetAuthorizations).set({ status: "REVOKED" });
    };
    const jobId = await seedRunnableJob();
    const report = await runnerWith().run(jobId);
    expect(report).toMatchObject({
      verdict: "INCONCLUSIVE",
      inconclusiveReason: "AUTHORIZATION_LAPSED",
    });
    expect(codeOf(report.checks, "retry_safety")).toBe("INCONCLUSIVE:NOT_RUN");
    expect(seller.paidRequests()).toHaveLength(1);
    expect((await paymentRows(jobId)).map((row) => row.status)).toEqual(["SETTLED"]);
    const snapshots = (await evidenceRows(jobId))
      .filter((row) => row.kind === "authorization_snapshot")
      .map((row) => row.sanitizedJson);
    expect(snapshots).toEqual([
      expect.objectContaining({ stage: "run_start", valid: true }),
      expect.objectContaining({ stage: "before_replay", valid: false }),
    ]);
  });
});

describe("signing under the job wall clock", () => {
  it("abandons a signature that outlives the clock and releases the reservation", async () => {
    scheme.hang = true;
    const jobId = await seedRunnableJob();
    const report = await runnerWith({ wallClockMs: 300 }).run(jobId);
    expect(report).toMatchObject({ verdict: "INCONCLUSIVE", inconclusiveReason: "TARGET_TIMEOUT" });
    expect(codeOf(report.checks, "paid_delivery")).toBe("INCONCLUSIVE:NETWORK_UNAVAILABLE");
    expect(seller.paidRequests()).toEqual([]);
    expect((await paymentRows(jobId)).map((row) => row.status)).toEqual(["RELEASED"]);
    expect(await jobRow(jobId)).toMatchObject({ reservedSpendMicros: 0, unresolvedSpendMicros: 0 });
  });
});
