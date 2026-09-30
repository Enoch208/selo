import {
  evaluatePaidDelivery,
  formatMicros,
  type PaidDeliveryObservation,
  type ScenarioStatus,
} from "@selo/core";
import { eq } from "drizzle-orm";
import { downstreamPayments } from "../db/schema";
import { sha256Hex } from "../ids";
import type { PayOutcome } from "../payments/downstream";
import { payerSideReason, rejectionReasons } from "../payments/payer-rejection";
import { sha256Tag } from "../payments/sanitize-headers";
import { clockExpired, type JobContext } from "./context";
import { bodyPreviewChars } from "./deps";
import { evidenceFor } from "./evidence";
import { holdUnresolved, persistExpectedTxId, releaseOpen } from "./ledger-moves";
import { claimObservation, recordClaim, settlementClaim } from "./settlement-claim";
import type { OpenPayment } from "./state";

export type DeliveredOutcome = Extract<PayOutcome, { readonly kind: "delivered" }>;
type RejectedOutcome = Extract<PayOutcome, { readonly kind: "rejected" }>;

export type Delivery =
  | { readonly kind: "none" }
  | {
      readonly kind: "response";
      readonly response: DeliveredOutcome;
      readonly paidEvidenceId: string;
      readonly settledTxId: string | null;
    };

const none: Delivery = { kind: "none" };

async function paymentEvidence(
  ctx: JobContext,
  open: OpenPayment,
  outcome: string,
): Promise<string> {
  const [row] = await ctx.db
    .select()
    .from(downstreamPayments)
    .where(eq(downstreamPayments.id, open.paymentId));
  return evidenceFor(ctx, ctx.scenarios.paid_delivery, "downstream_payment", {
    paymentId: open.paymentId,
    outcome,
    status: row?.status ?? null,
    amountUsdc: formatMicros(open.amountMicros),
    network: row?.network ?? null,
    assetId: row?.assetId ?? null,
    payTo: row?.payTo ?? null,
    txId: row?.txId ?? null,
    expectedTxId: row?.expectedTxId ?? null,
    requestedAt: row?.requestedAt ?? null,
    settledAt: row?.settledAt ?? null,
    resolutionReason: row?.resolutionReason ?? null,
  });
}

export async function concludePaid(
  ctx: JobContext,
  observation: PaidDeliveryObservation,
  evidence: readonly string[],
  via: ScenarioStatus | null,
): Promise<void> {
  const scenario = ctx.scenarios.paid_delivery;
  if (via !== null) {
    await scenario.advance(via);
  }
  const check = ctx.state.record({
    ...evaluatePaidDelivery({ observation, evidence: [] }),
    evidence,
  });
  await scenario.evaluate(check, observation);
}

function deliveredSnapshot(ctx: JobContext, outcome: DeliveredOutcome) {
  const body = outcome.bodyText;
  return {
    status: outcome.status,
    contentType: outcome.contentType,
    headers: ctx.io.lastHeaders(),
    txId: outcome.txId,
    settlementHeaderMalformed: outcome.settlementHeaderMalformed,
    requestedAt: outcome.requestedAt,
    bodySha256: body === null ? null : sha256Hex(body),
    bodyBytes: body === null ? null : Buffer.byteLength(body),
    bodyPreview: body === null ? null : body.slice(0, bodyPreviewChars),
    bodyTooLarge: outcome.bodyTooLarge,
    bodyReadFailure: outcome.bodyReadFailure,
    replayHeaderSha256: sha256Tag(outcome.replayHeader.value),
  };
}

function rejectedSnapshot(ctx: JobContext, outcome: RejectedOutcome, payerReason: string | null) {
  return {
    status: outcome.status,
    errorReason: outcome.errorReason,
    payerSideReason: payerReason,
    headers: ctx.io.lastHeaders(),
    requestedAt: outcome.requestedAt,
    challenge: outcome.challenge.decoded,
  };
}

async function delivered(
  ctx: JobContext,
  open: OpenPayment,
  outcome: DeliveredOutcome,
): Promise<Delivery> {
  const claim = settlementClaim(outcome);
  const paidEvidenceId = await evidenceFor(ctx, ctx.scenarios.paid_delivery, "paid_response", {
    ...deliveredSnapshot(ctx, outcome),
    txId: claim.kind === "matched" || claim.kind === "expected_unavailable" ? claim.txId : null,
    claimedTxId: outcome.txId,
    settlementTxCheck: claim.kind,
  });
  const settledTxId = await recordClaim(ctx, open, claim);
  const evidence = [paidEvidenceId, await paymentEvidence(ctx, open, "delivered")];
  const observation = claimObservation(outcome.status, claim, settledTxId);
  await concludePaid(
    ctx,
    observation,
    evidence,
    settledTxId !== null ? "SETTLED" : "TIMEOUT_UNRESOLVED",
  );
  return { kind: "response", response: outcome, paidEvidenceId, settledTxId };
}

export async function applyPayOutcome(
  ctx: JobContext,
  open: OpenPayment,
  outcome: PayOutcome,
): Promise<Delivery> {
  if (
    outcome.kind === "signing_failed" ||
    outcome.kind === "blocked" ||
    outcome.kind === "network_error_before_send"
  ) {
    await releaseOpen(ctx, open, `nothing sent: ${outcome.kind}`);
    ctx.state.inconclusive(clockExpired(ctx) ? "TARGET_TIMEOUT" : "NETWORK_UNAVAILABLE");
    const evidence = [await paymentEvidence(ctx, open, outcome.kind)];
    await concludePaid(ctx, { kind: "network_error" }, evidence, null);
    return none;
  }
  const sent: OpenPayment = { ...open, requestedAt: outcome.requestedAt };
  ctx.state.openPayment = sent;
  await persistExpectedTxId(ctx, sent, outcome);
  if (outcome.kind === "delivered") {
    return delivered(ctx, sent, outcome);
  }
  if (outcome.kind === "ambiguous") {
    await holdUnresolved(ctx, sent, `ambiguous outcome: ${outcome.message}`);
    const evidence = [await paymentEvidence(ctx, sent, "ambiguous")];
    await concludePaid(ctx, { kind: "timeout_unresolved" }, evidence, "TIMEOUT_UNRESOLVED");
    return none;
  }
  const payerReason = payerSideReason(outcome.errorReason, outcome.challenge.decoded);
  const paidEvidenceId = await evidenceFor(
    ctx,
    ctx.scenarios.paid_delivery,
    "paid_response",
    rejectedSnapshot(ctx, outcome, payerReason),
  );
  const reasons = rejectionReasons(outcome.errorReason, outcome.challenge.decoded);
  await holdUnresolved(
    ctx,
    sent,
    `target rejected the signed payment (${reasons.join("; ") || "no reason"})`,
  );
  const evidence = [paidEvidenceId, await paymentEvidence(ctx, sent, "rejected")];
  const observation: PaidDeliveryObservation =
    payerReason === null
      ? { kind: "rejected", status: outcome.status }
      : { kind: "payer_rejected", status: outcome.status, reason: payerReason };
  await concludePaid(ctx, observation, evidence, "REJECTED");
  return none;
}
