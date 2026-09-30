import type { ApiError } from "@selo/core";
import { describe, expect, it } from "vitest";
import { failedTx, pendingTx, type SettleMode } from "../support/fake-facilitator";
import {
  allJobs,
  captureAlerts,
  facilitator,
  jobRow,
  paidHeaders,
  paidRequest,
  releaseTest,
  runner,
  seedPreflight,
  useReleaseHarness,
} from "./harness";

useReleaseHarness();

type UnresolvedReply = ApiError & { readonly jobId: string; readonly txId: string | null };

const alerts = captureAlerts();

const mayStillLand: readonly {
  readonly mode: SettleMode;
  readonly txId: string | null;
  readonly settleCalls: number;
}[] = [
  { mode: "settle-error-500", txId: null, settleCalls: 1 },
  { mode: "pending", txId: pendingTx, settleCalls: 2 },
  { mode: "pending-thrown", txId: pendingTx, settleCalls: 2 },
  { mode: "failed-with-tx", txId: failedTx, settleCalls: 1 },
];

describe("settlement failures that may still land on chain", () => {
  it.each(mayStillLand)(
    "$mode holds the job INCONCLUSIVE, never deletes or runs it, and answers 502",
    async ({ mode, txId, settleCalls }) => {
      facilitator.settleMode = mode;
      const { response } = await paidRequest();
      const body = (await response.json()) as UnresolvedReply;

      expect(response.status).toBe(502);
      expect(response.headers.get("PAYMENT-REQUIRED")).toBeNull();
      expect(body).toMatchObject({ error: "INBOUND_SETTLEMENT_UNRESOLVED", txId });
      expect(facilitator.settleCalls()).toHaveLength(settleCalls);
      expect(runner.runs).toHaveLength(0);
      expect(await jobRow(body.jobId)).toMatchObject({
        status: "INCONCLUSIVE",
        inconclusiveReason: "FACILITATOR_UNAVAILABLE",
        incomingTxId: txId,
        incomingSettledAt: null,
        incomingAmountMicros: null,
      });
      expect(alerts.join("")).toContain(body.jobId);
    },
  );

  it("the alert carries the facilitator's error reason and message", async () => {
    facilitator.settleMode = "failed-with-tx";
    await paidRequest();
    expect(alerts.join("")).toContain(
      `txId=${failedTx} cause=transaction_failed: algod rejected the group after broadcast`,
    );
  });

  it("an unresolved tx already held by another job is alerted and the job is held without it", async () => {
    facilitator.settleMode = "pending";
    const first = (await (await paidRequest()).response.json()) as UnresolvedReply;
    const secondBody = { preflightId: await seedPreflight(), profile: "quick" };
    const secondReply = await releaseTest(secondBody, await paidHeaders(secondBody, "b"));
    const second = (await secondReply.json()) as UnresolvedReply;

    expect(await jobRow(first.jobId)).toMatchObject({ incomingTxId: pendingTx });
    expect(await jobRow(second.jobId)).toMatchObject({
      status: "INCONCLUSIVE",
      inconclusiveReason: "FACILITATOR_UNAVAILABLE",
      incomingTxId: null,
    });
    expect(alerts.join("")).toContain(
      `ALERT event=inbound_unresolved_tx_already_held jobId=${second.jobId} txId=${pendingTx}`,
    );
  });

  it("a retry of an unresolved request is answered from the held job without settling again", async () => {
    facilitator.settleMode = "pending";
    const { body, headers, response } = await paidRequest();
    const first = (await response.json()) as UnresolvedReply;
    const retry = await releaseTest(body, headers);
    const second = (await retry.json()) as UnresolvedReply;

    expect(retry.status).toBe(502);
    expect(second.jobId).toBe(first.jobId);
    expect(second.txId).toBe(pendingTx);
    expect(facilitator.settleCalls()).toHaveLength(2);
  });
});

describe("definite settlement rejections", () => {
  it.each(["rejected", "settle-error-400"] as const)(
    "%s deletes the READY job and answers 402 so the client may pay again",
    async (mode) => {
      facilitator.settleMode = mode;
      const { response } = await paidRequest();
      expect(response.status).toBe(402);
      expect(runner.runs).toHaveLength(0);
      expect(await allJobs()).toHaveLength(0);
    },
  );
});
