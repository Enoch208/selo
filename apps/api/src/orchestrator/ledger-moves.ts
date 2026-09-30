import { formatMicros } from "@selo/core";
import { eq } from "drizzle-orm";
import { downstreamPayments } from "../db/schema";
import {
  markDownstreamUnresolved,
  releaseDownstream,
  settleDownstream,
  type TransitionResult,
} from "../ledger/transitions";
import type { ExpectedTxId } from "../payments/downstream";
import { log, type JobContext } from "./context";
import { alert } from "./log";
import type { OpenPayment } from "./state";

function describe(result: TransitionResult): string {
  if (result.applied) {
    return result.status;
  }
  return "reason" in result ? result.reason : `already ${result.current}`;
}

function logMove(ctx: JobContext, open: OpenPayment, event: string, txId: string | null): void {
  log(ctx, {
    event,
    scenarioId: ctx.scenarios.paid_delivery.id,
    operationId: ctx.scenarios.paid_delivery.operationId,
    amountUsdc: formatMicros(open.amountMicros),
    downstreamTxId: txId,
  });
}

export async function persistExpectedTxId(
  ctx: JobContext,
  open: OpenPayment,
  expected: ExpectedTxId,
): Promise<void> {
  if (expected.expectedTxId === null) {
    return;
  }
  await ctx.db
    .update(downstreamPayments)
    .set({ expectedTxId: expected.expectedTxId })
    .where(eq(downstreamPayments.id, open.paymentId));
}

export async function releaseOpen(
  ctx: JobContext,
  open: OpenPayment,
  reason: string,
): Promise<void> {
  const result = await releaseDownstream(ctx.db, open.paymentId, { reason, requestedAt: null });
  ctx.state.openPayment = null;
  if (!result.applied) {
    alert("downstream_release_not_applied", ctx.job.id, {
      paymentId: open.paymentId,
      result: describe(result),
    });
  }
  logMove(ctx, open, "downstream_released", null);
}

export async function holdUnresolved(
  ctx: JobContext,
  open: OpenPayment,
  reason: string,
): Promise<void> {
  const result = await markDownstreamUnresolved(ctx.db, open.paymentId, {
    reason,
    requestedAt: open.requestedAt,
  });
  ctx.state.openPayment = null;
  ctx.state.stopSpending = true;
  ctx.state.inconclusive("PAYMENT_UNRESOLVED");
  alert("downstream_unresolved", ctx.job.id, {
    paymentId: open.paymentId,
    amountUsdc: formatMicros(open.amountMicros),
    reason,
    result: describe(result),
  });
  logMove(ctx, open, "downstream_unresolved", null);
}

export async function settleOpen(
  ctx: JobContext,
  open: OpenPayment,
  txId: string,
): Promise<boolean> {
  const result = await settleDownstream(ctx.db, open.paymentId, {
    txId,
    requestedAt: open.requestedAt,
  });
  if (result.applied) {
    ctx.state.openPayment = null;
    logMove(ctx, open, "downstream_settled", txId);
    return true;
  }
  const event = "reason" in result ? "downstream_duplicate_tx" : "downstream_settle_conflict";
  alert(event, ctx.job.id, { paymentId: open.paymentId, txId, result: describe(result) });
  await holdUnresolved(ctx, open, `settlement not recorded (${describe(result)}) for tx ${txId}`);
  return false;
}
