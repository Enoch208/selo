import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  downstreamPayments,
  evidence,
  releaseJobs,
  targetAuthorizations,
} from "../../src/db/schema";
import { db } from "../support";
import { captureOutput, catalog, scheme, seller } from "../orchestrator/harness";
import { probeNetworkError } from "../orchestrator/stock-seller";
import { e2eApp, payRelease, prepareRelease, seloFacilitator, useE2eHarness } from "./harness";

useE2eHarness();
captureOutput();

const codes = (checks: readonly { id: string; status: string; code: string }[]) =>
  Object.fromEntries(checks.map((check) => [check.id, `${check.status}:${check.code}`]));

async function rowsFor(jobId: string) {
  const [job] = await db.select().from(releaseJobs).where(eq(releaseJobs.id, jobId));
  const payments = await db
    .select()
    .from(downstreamPayments)
    .where(eq(downstreamPayments.jobId, jobId));
  return { job, payments };
}

describe("release test failure model end to end", () => {
  it.each([
    ["revoked", sql`'REVOKED'::authorization_status`, sql`${targetAuthorizations.expiresAt}`],
    ["expired", sql`${targetAuthorizations.status}`, sql`now() - interval '1 second'`],
  ])(
    "A09: unauthorized target cannot be paid (authorization %s between preflight and run)",
    async (_, status, expiresAt) => {
      const app = await e2eApp();
      const prepared = await prepareRelease(app);
      const before = seller.requests.length;
      seloFacilitator.beforeSettle = async () => {
        await db
          .update(targetAuthorizations)
          .set({ status, expiresAt })
          .where(eq(targetAuthorizations.id, prepared.authorizationId));
      };
      const { status: httpStatus, report } = await payRelease(app, prepared);
      expect(httpStatus).toBe(200);
      expect(report).toMatchObject({
        verdict: "INCONCLUSIVE",
        inconclusiveReason: "AUTHORIZATION_LAPSED",
      });
      expect(seller.requests.length).toBe(before);
      expect(scheme.signedTxIds).toEqual([]);
      const { payments } = await rowsFor(report.jobId);
      expect(payments).toEqual([]);
      const snapshots = await db.select().from(evidence).where(eq(evidence.jobId, report.jobId));
      expect(snapshots.map((row) => row.kind)).toEqual(["authorization_snapshot"]);
      expect(snapshots[0]?.sanitizedJson).toMatchObject({ valid: false });
    },
  );

  it("A17: a timeout with ambiguous payment state stops further spending", async () => {
    const app = await e2eApp(1_500);
    const prepared = await prepareRelease(app);
    seller.hangPaid = true;
    const { report } = await payRelease(app, prepared);
    expect(report).toMatchObject({
      verdict: "INCONCLUSIVE",
      inconclusiveReason: "PAYMENT_UNRESOLVED",
    });
    expect(codes(report.checks)).toMatchObject({
      paid_delivery: "INCONCLUSIVE:PAYMENT_UNRESOLVED",
      retry_safety: "INCONCLUSIVE:NOT_RUN",
    });
    const { job, payments } = await rowsFor(report.jobId);
    expect(payments.map((row) => [row.status, row.txId])).toEqual([["UNRESOLVED", null]]);
    expect(payments[0]?.expectedTxId).toBe(scheme.signedTxIds[0]);
    expect(job).toMatchObject({
      unresolvedSpendMicros: 10_000,
      reservedSpendMicros: 0,
      settledSpendMicros: 0,
    });
    expect(seller.paidRequests()).toHaveLength(1);
    expect(scheme.signedTxIds).toHaveLength(1);
  });

  it("A18: a response violating the expected schema produces FAIL", async () => {
    const app = await e2eApp();
    const prepared = await prepareRelease(app, {
      status: 200,
      contentType: "application/json",
      jsonSchema: {
        type: "object",
        required: ["quote", "expiresAt"],
        properties: { quote: { type: "number" }, expiresAt: { type: "string" } },
      },
    });
    const { report } = await payRelease(app, prepared);
    expect(report.verdict).toBe("FAIL");
    expect(codes(report.checks).response_contract).toBe("FAIL:SCHEMA_MISMATCH");
    expect(codes(report.checks).paid_delivery).toBe("PASS:PAID_AND_DELIVERED");
  });

  it("A19: infrastructure uncertainty produces INCONCLUSIVE (probe network error)", async () => {
    const app = await e2eApp();
    const prepared = await prepareRelease(app);
    seller.unpaidFailure = probeNetworkError();
    const { report } = await payRelease(app, prepared);
    expect(report).toMatchObject({
      verdict: "INCONCLUSIVE",
      inconclusiveReason: "NETWORK_UNAVAILABLE",
    });
    expect(codes(report.checks).handshake).toBe("INCONCLUSIVE:NETWORK_UNAVAILABLE");
    expect((await rowsFor(report.jobId)).payments).toEqual([]);
  });

  it("A19: infrastructure uncertainty produces INCONCLUSIVE (catalog unavailable)", async () => {
    const app = await e2eApp();
    const prepared = await prepareRelease(app);
    catalog.mode = "unavailable";
    const { report } = await payRelease(app, prepared);
    expect(report).toMatchObject({
      verdict: "INCONCLUSIVE",
      inconclusiveReason: "FACILITATOR_UNAVAILABLE",
    });
    expect(codes(report.checks).discovery_contract).toBe("INCONCLUSIVE:CATALOG_UNAVAILABLE");
  });

  it("fails with PAID_REQUEST_REJECTED and holds the payment UNRESOLVED when the target rejects it", async () => {
    const app = await e2eApp();
    const prepared = await prepareRelease(app);
    seller.facilitator.rejectFirstSettle = true;
    const { report } = await payRelease(app, prepared);
    expect(report.verdict).toBe("FAIL");
    expect(codes(report.checks)).toMatchObject({
      paid_delivery: "FAIL:PAID_REQUEST_REJECTED",
      retry_safety: "INCONCLUSIVE:NOT_RUN",
    });
    const { payments, job } = await rowsFor(report.jobId);
    expect(payments.map((row) => row.status)).toEqual(["UNRESOLVED"]);
    expect(job).toMatchObject({ unresolvedSpendMicros: 10_000 });
    expect(seller.paidRequests()).toHaveLength(1);
  });

  it("denies a price raised above the budget after preflight: nothing signed, INCONCLUSIVE BUDGET_EXHAUSTED", async () => {
    const app = await e2eApp();
    const prepared = await prepareRelease(app);
    seller.priceMicros = 900_000;
    const { report } = await payRelease(app, prepared);
    expect(report).toMatchObject({
      verdict: "INCONCLUSIVE",
      inconclusiveReason: "BUDGET_EXHAUSTED",
    });
    expect(codes(report.checks).paid_delivery).toBe("INCONCLUSIVE:SPEND_GUARD_DENIED");
    expect(scheme.signedTxIds).toEqual([]);
    expect(seller.paidRequests()).toEqual([]);
    expect((await rowsFor(report.jobId)).payments).toEqual([]);
  });
});
