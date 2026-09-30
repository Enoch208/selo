import { describe, expect, it } from "vitest";
import type { PaidDeliveryObservation } from "../../src/checks/paid-delivery";
import { evaluatePaidDelivery } from "../../src/checks/paid-delivery";

const evidence = ["ev-2"];

function evaluate(observation: PaidDeliveryObservation) {
  return evaluatePaidDelivery({ observation, evidence });
}

describe("evaluatePaidDelivery", () => {
  it("delivered 2xx with a txId is PAID_AND_DELIVERED", () => {
    const check = evaluate({ kind: "delivered", status: 200, txId: "TXID123" });
    expect(check.id).toBe("paid_delivery");
    expect(check.status).toBe("PASS");
    expect(check.code).toBe("PAID_AND_DELIVERED");
    expect(check.blocking).toBe(true);
    expect(check.evidence).toBe(evidence);
    expect(typeof check.summary).toBe("string");
  });

  it.each([null, ""])("delivered 2xx with txId %j is SETTLEMENT_UNCONFIRMED", (txId) => {
    const check = evaluate({ kind: "delivered", status: 200, txId });
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.code).toBe("SETTLEMENT_UNCONFIRMED");
  });

  it("delivered 5xx with a txId is PAID_BUT_NOT_DELIVERED", () => {
    const check = evaluate({ kind: "delivered", status: 502, txId: "TXID123" });
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("PAID_BUT_NOT_DELIVERED");
  });

  it.each([301, 404])("delivered %i with a txId is PAID_BUT_NOT_DELIVERED", (status) => {
    const check = evaluate({ kind: "delivered", status, txId: "TXID123" });
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("PAID_BUT_NOT_DELIVERED");
  });

  it("delivered non-2xx without a txId is SETTLEMENT_UNCONFIRMED", () => {
    const check = evaluate({ kind: "delivered", status: 500, txId: null });
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.code).toBe("SETTLEMENT_UNCONFIRMED");
  });

  it("a rejected paid request is PAID_REQUEST_REJECTED", () => {
    const check = evaluate({ kind: "rejected", status: 402 });
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("PAID_REQUEST_REJECTED");
  });

  it("a rejected paid request never claims the payment settled", () => {
    const check = evaluate({ kind: "rejected", status: 402 });
    expect(check.summary).not.toMatch(/after payment settled/);
  });

  it("a payer-side rejection is PAYER_REJECTED and INCONCLUSIVE, not a target FAIL", () => {
    const check = evaluate({
      kind: "payer_rejected",
      status: 402,
      reason: "invalid_exact_avm_simulation_failed",
    });
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.code).toBe("PAYER_REJECTED");
    expect(check.summary).toContain("invalid_exact_avm_simulation_failed");
  });

  it("a settlement tx id that differs from Selo's signed transaction is SETTLEMENT_TX_MISMATCH", () => {
    const check = evaluate({
      kind: "settlement_mismatch",
      status: 200,
      claimedTxId: "CLAIMEDTX",
      expectedTxId: "EXPECTEDTX",
    });
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.code).toBe("SETTLEMENT_TX_MISMATCH");
    expect(check.summary).toContain("CLAIMEDTX");
    expect(check.summary).toContain("EXPECTEDTX");
  });

  it("an unfunded operating wallet is OPERATOR_WALLET_UNFUNDED, not a target problem", () => {
    const check = evaluate({
      kind: "operator_wallet",
      problem: "unfunded",
      detail: "USDC balance 0.00 is below 0.01",
    });
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.code).toBe("OPERATOR_WALLET_UNFUNDED");
    expect(check.summary).toContain("USDC balance 0.00 is below 0.01");
  });

  it("an unreadable operating wallet is NETWORK_UNAVAILABLE", () => {
    const check = evaluate({
      kind: "operator_wallet",
      problem: "unreachable",
      detail: "algod timed out",
    });
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.code).toBe("NETWORK_UNAVAILABLE");
    expect(check.summary).toContain("algod timed out");
  });

  it("timeout_unresolved is PAYMENT_UNRESOLVED", () => {
    const check = evaluate({ kind: "timeout_unresolved" });
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.code).toBe("PAYMENT_UNRESOLVED");
  });

  it("network_error is NETWORK_UNAVAILABLE", () => {
    const check = evaluate({ kind: "network_error" });
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.code).toBe("NETWORK_UNAVAILABLE");
  });

  it("guard_denied is SPEND_GUARD_DENIED and names the reason in the summary", () => {
    const check = evaluate({ kind: "guard_denied", reason: "SCENARIO_BUDGET_EXCEEDED" });
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.code).toBe("SPEND_GUARD_DENIED");
    expect(check.summary).toContain("SCENARIO_BUDGET_EXCEEDED");
  });

  it("not_run is NOT_RUN", () => {
    const check = evaluate({ kind: "not_run" });
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.code).toBe("NOT_RUN");
  });

  it("passes the caller's evidence ids through unchanged", () => {
    const check = evaluate({ kind: "not_run" });
    expect(check.evidence).toBe(evidence);
  });
});
