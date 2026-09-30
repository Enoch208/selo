import type { CheckResult, CheckStatus, SpendDenialReason } from "../contract";

export type PaidDeliveryObservation =
  | { readonly kind: "delivered"; readonly status: number; readonly txId: string | null }
  | { readonly kind: "rejected"; readonly status: number }
  | { readonly kind: "payer_rejected"; readonly status: number; readonly reason: string }
  | {
      readonly kind: "settlement_mismatch";
      readonly status: number;
      readonly claimedTxId: string;
      readonly expectedTxId: string;
    }
  | {
      readonly kind: "operator_wallet";
      readonly problem: "unfunded" | "unreachable";
      readonly detail: string;
    }
  | { readonly kind: "timeout_unresolved" }
  | { readonly kind: "network_error" }
  | { readonly kind: "guard_denied"; readonly reason: SpendDenialReason }
  | { readonly kind: "not_run" };

export interface EvaluatePaidDeliveryInput {
  readonly observation: PaidDeliveryObservation;
  readonly evidence: readonly string[];
}

function hasTxId(txId: string | null): txId is string {
  return txId !== null && txId.length > 0;
}

function build(
  evidence: readonly string[],
  status: CheckStatus,
  code: string,
  summary: string,
): CheckResult {
  return { id: "paid_delivery", status, code, blocking: true, summary, evidence };
}

function evaluateDelivered(
  evidence: readonly string[],
  status: number,
  txId: string | null,
): CheckResult {
  const is2xx = status >= 200 && status < 300;
  const delivered = hasTxId(txId);
  if (is2xx) {
    if (delivered) {
      return build(
        evidence,
        "PASS",
        "PAID_AND_DELIVERED",
        `Downstream payment settled and target returned ${String(status)} with transaction ${txId}.`,
      );
    }
    return build(
      evidence,
      "INCONCLUSIVE",
      "SETTLEMENT_UNCONFIRMED",
      `Target returned ${String(status)} but no settlement transaction id was recorded.`,
    );
  }
  if (delivered) {
    return build(
      evidence,
      "FAIL",
      "PAID_BUT_NOT_DELIVERED",
      `Payment settled with transaction ${txId} but target then returned status ${String(status)}.`,
    );
  }
  return build(
    evidence,
    "INCONCLUSIVE",
    "SETTLEMENT_UNCONFIRMED",
    `Target returned status ${String(status)} without a settlement transaction id.`,
  );
}

function evaluateOperatorWallet(
  evidence: readonly string[],
  problem: "unfunded" | "unreachable",
  detail: string,
): CheckResult {
  if (problem === "unfunded") {
    return build(
      evidence,
      "INCONCLUSIVE",
      "OPERATOR_WALLET_UNFUNDED",
      `Selo's operating wallet could not cover this payment, so nothing was signed (${detail}).`,
    );
  }
  return build(
    evidence,
    "INCONCLUSIVE",
    "NETWORK_UNAVAILABLE",
    `Selo could not read its operating wallet before paying, so nothing was signed (${detail}).`,
  );
}

export function evaluatePaidDelivery(input: EvaluatePaidDeliveryInput): CheckResult {
  const { observation, evidence } = input;
  switch (observation.kind) {
    case "delivered":
      return evaluateDelivered(evidence, observation.status, observation.txId);
    case "rejected":
      return build(
        evidence,
        "FAIL",
        "PAID_REQUEST_REJECTED",
        `Target rejected the signed payment with status ${String(observation.status)} and did not deliver.`,
      );
    case "payer_rejected":
      return build(
        evidence,
        "INCONCLUSIVE",
        "PAYER_REJECTED",
        `Target answered ${String(observation.status)} with a payer-side reason (${observation.reason}); the fault may lie with Selo's own payment, not the target.`,
      );
    case "settlement_mismatch":
      return build(
        evidence,
        "INCONCLUSIVE",
        "SETTLEMENT_TX_MISMATCH",
        `Target returned ${String(observation.status)} claiming settlement transaction ${observation.claimedTxId}, but Selo signed transaction ${observation.expectedTxId}; the claim was not accepted as settlement.`,
      );
    case "operator_wallet":
      return evaluateOperatorWallet(evidence, observation.problem, observation.detail);
    case "timeout_unresolved":
      return build(
        evidence,
        "INCONCLUSIVE",
        "PAYMENT_UNRESOLVED",
        "The downstream payment timed out without a resolved outcome.",
      );
    case "network_error":
      return build(
        evidence,
        "INCONCLUSIVE",
        "NETWORK_UNAVAILABLE",
        "A network error prevented the downstream payment request from completing.",
      );
    case "guard_denied":
      return build(
        evidence,
        "INCONCLUSIVE",
        "SPEND_GUARD_DENIED",
        `The spend guard denied the downstream payment: ${observation.reason}.`,
      );
    case "not_run":
      return build(evidence, "INCONCLUSIVE", "NOT_RUN", "The paid delivery check did not run.");
  }
}
