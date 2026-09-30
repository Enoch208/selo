import type { PaidDeliveryObservation } from "@selo/core";
import type { JobContext } from "./context";
import { holdUnresolved, settleOpen } from "./ledger-moves";
import { alert } from "./log";
import type { DeliveredOutcome } from "./paid-outcome";
import type { OpenPayment } from "./state";

export type SettlementClaim =
  | { readonly kind: "no_claim" }
  | { readonly kind: "expected_unavailable"; readonly txId: string }
  | { readonly kind: "matched"; readonly txId: string }
  | { readonly kind: "mismatch"; readonly claimedTxId: string; readonly expectedTxId: string };

export function settlementClaim(outcome: DeliveredOutcome): SettlementClaim {
  const { txId, expectedTxId } = outcome;
  if (txId === null) {
    return { kind: "no_claim" };
  }
  if (expectedTxId === null) {
    return { kind: "expected_unavailable", txId };
  }
  return txId === expectedTxId
    ? { kind: "matched", txId }
    : { kind: "mismatch", claimedTxId: txId, expectedTxId };
}

export async function recordClaim(
  ctx: JobContext,
  open: OpenPayment,
  claim: SettlementClaim,
): Promise<string | null> {
  if (claim.kind === "no_claim") {
    await holdUnresolved(ctx, open, "target answered without a settlement transaction id");
    return null;
  }
  if (claim.kind === "mismatch") {
    alert("downstream_settlement_tx_mismatch", ctx.job.id, {
      paymentId: open.paymentId,
      claimedTxId: claim.claimedTxId,
      expectedTxId: claim.expectedTxId,
    });
    await holdUnresolved(
      ctx,
      open,
      `target claimed settlement tx ${claim.claimedTxId} but Selo signed tx ${claim.expectedTxId}`,
    );
    return null;
  }
  return (await settleOpen(ctx, open, claim.txId)) ? claim.txId : null;
}

export function claimObservation(
  status: number,
  claim: SettlementClaim,
  settledTxId: string | null,
): PaidDeliveryObservation {
  if (claim.kind === "mismatch") {
    const { claimedTxId, expectedTxId } = claim;
    return { kind: "settlement_mismatch", status, claimedTxId, expectedTxId };
  }
  if (claim.kind === "no_claim") {
    return { kind: "delivered", status, txId: null };
  }
  return settledTxId === null
    ? { kind: "timeout_unresolved" }
    : { kind: "delivered", status, txId: settledTxId };
}
