import type { ApiError } from "@selo/core";
import { decodePaymentResponseHeader } from "@x402/core/http";
import algosdk from "algosdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  captureAlerts,
  facilitator,
  jobRow,
  paidRequest,
  releaseTest,
  runner,
  useReleaseHarness,
} from "./harness";
import { inboundPayer } from "../support/fake-facilitator";

const failures = vi.hoisted(() => ({ record: false, markInconclusive: false }));

vi.mock("../../src/release/jobs", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/release/jobs")>();
  return {
    ...original,
    recordInboundSettlement: (...args: Parameters<typeof original.recordInboundSettlement>) =>
      failures.record
        ? Promise.reject(new Error("connection terminated unexpectedly"))
        : original.recordInboundSettlement(...args),
    markInconclusive: (...args: Parameters<typeof original.markInconclusive>) =>
      failures.markInconclusive
        ? Promise.reject(new Error("connection terminated unexpectedly"))
        : original.markInconclusive(...args),
  };
});

useReleaseHarness();

type JobReply = ApiError & { readonly jobId: string };

const alerts = captureAlerts();

beforeEach(() => {
  failures.record = false;
  failures.markInconclusive = false;
});

function settledTx(response: Response): unknown {
  return decodePaymentResponseHeader(response.headers.get("PAYMENT-RESPONSE") ?? "");
}

describe("a database failure after the inbound payment settled", () => {
  it("alerts with the tx first, never runs the job and answers 500 with PAYMENT-RESPONSE", async () => {
    failures.record = true;
    const { response } = await paidRequest();
    const body = (await response.json()) as JobReply;

    expect(response.status).toBe(500);
    expect(body.error).toBe("INBOUND_RECORD_FAILED");
    expect(settledTx(response)).toMatchObject({ success: true, transaction: "INBOUNDTX1" });
    expect(runner.runs).toHaveLength(0);
    expect(facilitator.settleCalls()).toHaveLength(1);
    const [first] = alerts;
    expect(first).toContain(
      `ALERT event=inbound_settled_not_recorded jobId=${body.jobId} txId=INBOUNDTX1 payer=${inboundPayer} amountMicros=1000000`,
    );
    expect(await jobRow(body.jobId)).toMatchObject({
      status: "INCONCLUSIVE",
      inconclusiveReason: "INTERNAL_ERROR",
    });
  });

  it("a retry after a record failure gets a terminal answer, not the unresolved-settlement one", async () => {
    failures.record = true;
    const { body, headers, response } = await paidRequest();
    const first = (await response.json()) as JobReply;
    const retry = await releaseTest(body, headers);
    const second = (await retry.json()) as JobReply & { readonly inconclusiveReason: string };

    expect(retry.status).toBe(409);
    expect(second).toMatchObject({
      error: "JOB_TERMINAL",
      jobId: first.jobId,
      inconclusiveReason: "INTERNAL_ERROR",
    });
    expect(facilitator.settleCalls()).toHaveLength(1);
  });

  it("still answers with PAYMENT-RESPONSE when marking the job INCONCLUSIVE also fails", async () => {
    failures.record = true;
    failures.markInconclusive = true;
    const { response } = await paidRequest();
    const body = (await response.json()) as JobReply;

    expect(response.status).toBe(500);
    expect(body.error).toBe("INBOUND_RECORD_FAILED");
    expect(settledTx(response)).toMatchObject({ transaction: "INBOUNDTX1" });
    expect(alerts.join("")).toContain("txId=INBOUNDTX1");
  });

  it("a runner crash keeps PAYMENT-RESPONSE even when marking the job INCONCLUSIVE fails", async () => {
    failures.markInconclusive = true;
    runner.failure = new Error("orchestrator exploded");
    const { response } = await paidRequest();
    const body = (await response.json()) as JobReply;

    expect(response.status).toBe(500);
    expect(body.error).toBe("INTERNAL");
    expect(settledTx(response)).toMatchObject({ transaction: "INBOUNDTX1" });
    expect(alerts.join("")).toContain(body.jobId);
    expect(body.message).not.toContain("recorded as INCONCLUSIVE");
    expect(body.message).toContain("reconciliation");
    expect(alerts.join("")).toContain("event=job_mark_inconclusive_failed");
  });

  it("routes release alerts through the sanitizing logger so a secret in a cause never reaches stderr", async () => {
    const mnemonic = algosdk.secretKeyToMnemonic(algosdk.generateAccount().sk);
    runner.failure = new Error(`orchestrator exploded near ${mnemonic}`);
    const { response } = await paidRequest();
    const body = (await response.json()) as JobReply;
    const stderr = alerts.join("");

    expect(stderr).toContain(`ALERT event=runner_failed_after_settlement jobId=${body.jobId}`);
    expect(stderr).toContain("sha256:");
    expect(stderr).not.toContain(mnemonic.split(" ").slice(0, 3).join(" "));
  });
});
