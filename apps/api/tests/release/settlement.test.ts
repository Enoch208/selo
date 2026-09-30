import type { ApiError, ReleaseTestResponse } from "@selo/core";
import { decodePaymentResponseHeader } from "@x402/core/http";
import { describe, expect, it } from "vitest";
import {
  allJobs,
  captureAlerts,
  facilitator,
  jobMaxSpendMicros,
  jobRow,
  paidRequest as harnessPaidRequest,
  priceMicros,
  releaseTest,
  runner,
  useReleaseHarness,
} from "./harness";
import { inboundPayer } from "../support/fake-facilitator";

useReleaseHarness();

type JobReply = ApiError & { readonly jobId: string };

const alerts = captureAlerts();

async function paidRequest() {
  return (await harnessPaidRequest()).response;
}

describe("settle before orchestrate", () => {
  it("A12: inbound settles before the first downstream request", async () => {
    const response = await paidRequest();
    expect(response.status).toBe(200);

    const [settle] = facilitator.settleCalls();
    const [run] = runner.runs;
    expect(settle).toBeDefined();
    expect(run).toBeDefined();
    if (settle === undefined || run === undefined) {
      return;
    }
    expect(settle.completedAt).toBeLessThan(run.startedAt);
    expect(run.job).toMatchObject({
      status: "INBOUND_SETTLED",
      incomingTxId: "INBOUNDTX1",
      payer: inboundPayer,
      incomingAmountMicros: priceMicros,
      maxSpendMicros: jobMaxSpendMicros,
      gitSha: "testsha",
    });
    expect(run.job.incomingSettledAt).toBeInstanceOf(Date);
  });

  it("returns the report with the PAYMENT-RESPONSE settlement header", async () => {
    const response = await paidRequest();
    const body = (await response.json()) as ReleaseTestResponse;
    expect(body.money.seloInboundTxId).toBe("INBOUNDTX1");
    const header = response.headers.get("PAYMENT-RESPONSE");
    expect(header).not.toBeNull();
    expect(decodePaymentResponseHeader(header ?? "")).toMatchObject({
      success: true,
      transaction: "INBOUNDTX1",
    });
  });

  it("a rejected settlement never runs the job, removes it and answers 402", async () => {
    facilitator.settleMode = "rejected";
    const response = await paidRequest();
    expect(response.status).toBe(402);
    expect(facilitator.settleCalls()).toHaveLength(1);
    expect(runner.runs).toHaveLength(0);
    expect(await allJobs()).toHaveLength(0);
  });

  it.each(["timeout", "unreachable"] as const)(
    "an indeterminate settlement (%s) never runs the job and leaves it INCONCLUSIVE",
    async (mode) => {
      facilitator.settleMode = mode;
      const response = await paidRequest();
      const body = (await response.json()) as JobReply;
      expect(response.status).toBe(502);
      expect(body.error).toBe("INBOUND_SETTLEMENT_UNRESOLVED");
      expect(runner.runs).toHaveLength(0);
      expect(await jobRow(body.jobId)).toMatchObject({
        status: "INCONCLUSIVE",
        inconclusiveReason: "FACILITATOR_UNAVAILABLE",
        incomingTxId: null,
      });
      expect(alerts.join("")).toContain(body.jobId);
    },
  );

  it("a facilitator that cannot verify answers 502 without claiming a job or settling", async () => {
    facilitator.verifyTimesOut = true;
    const response = await paidRequest();
    const body = (await response.json()) as ApiError;
    expect(response.status).toBe(502);
    expect(body.error).toBe("FACILITATOR_UNAVAILABLE");
    expect(facilitator.settleCalls()).toHaveLength(0);
    expect(runner.runs).toHaveLength(0);
    expect(await allJobs()).toHaveLength(0);
  });

  it("a runner crash after settlement answers 500 with the job and the settlement header", async () => {
    runner.failure = new Error("orchestrator exploded");
    const response = await paidRequest();
    const body = (await response.json()) as JobReply;
    expect(response.status).toBe(500);
    expect(body.error).toBe("INTERNAL");
    expect(response.headers.get("PAYMENT-RESPONSE")).not.toBeNull();
    expect(body.message).toContain("recorded as INCONCLUSIVE");
    expect(await jobRow(body.jobId)).toMatchObject({
      status: "INCONCLUSIVE",
      inconclusiveReason: "INTERNAL_ERROR",
      incomingTxId: "INBOUNDTX1",
    });
    expect(alerts.join("")).toContain(body.jobId);
  });
});

describe("after the job is claimed", () => {
  it("persists the expected response contract on the job", async () => {
    const expected = {
      status: 201,
      contentType: "application/json",
      jsonSchema: { type: "object" },
    };
    const { response } = await harnessPaidRequest(expected);
    const body = (await response.json()) as ReleaseTestResponse;
    expect(response.status).toBe(200);
    expect((await jobRow(body.jobId))?.expectedJson).toEqual(expected);
  });

  it("a retry of a job that ended without a report gets a terminal answer, not in-progress", async () => {
    runner.failure = new Error("orchestrator exploded");
    const { body, headers, response } = await harnessPaidRequest();
    const first = (await response.json()) as JobReply;
    const retry = await releaseTest(body, headers);
    const second = (await retry.json()) as JobReply & {
      readonly status: string;
      readonly inconclusiveReason: string | null;
    };

    expect(retry.status).toBe(409);
    expect(second).toMatchObject({
      error: "JOB_TERMINAL",
      jobId: first.jobId,
      status: "INCONCLUSIVE",
      inconclusiveReason: "INTERNAL_ERROR",
    });
    expect(facilitator.settleCalls()).toHaveLength(1);
    expect(runner.runs).toHaveLength(1);
  });
});
