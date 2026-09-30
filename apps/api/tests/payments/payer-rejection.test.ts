import { describe, expect, it } from "vitest";
import { payerSideReason, payerSideReasons } from "../../src/payments/payer-rejection";

describe("payerSideReason", () => {
  it.each([...payerSideReasons])("maps the settle errorReason %s to the payer", (reason) => {
    expect(payerSideReason(reason, null)).toBe(reason);
  });

  it("reads the reason from the 402 challenge's error when there is no settle response", () => {
    const decoded = { x402Version: 2, error: "invalid_exact_avm_simulation_failed", accepts: [] };
    expect(payerSideReason(null, decoded)).toBe("invalid_exact_avm_simulation_failed");
  });

  it.each([
    "transaction rejected: overspend",
    "account not opted in to asset",
    "below min balance",
  ])("recognises the free-text payer-side reason %j", (reason) => {
    expect(payerSideReason(reason, null)).toBe(reason);
  });

  it.each([
    "invalid_exact_avm_receiver_mismatch",
    "invalid_exact_avm_amount_mismatch",
    "invalid_exact_avm_payload_transaction",
    "transaction_already_in_ledger",
  ])("keeps the target-side reason %s a genuine rejection", (reason) => {
    expect(payerSideReason(reason, { error: reason })).toBeNull();
  });

  it.each([
    "adopting a new facilitator",
    "optional field missing",
    "option not supported",
    "endpoint is opting out",
  ])("does not treat the unrelated text %j as payer-side", (reason) => {
    expect(payerSideReason(reason, null)).toBeNull();
  });

  it.each(["account not opted in to asset", "asset opt-in required", "optin missing"])(
    "still recognises the whole-word opt-in phrase %j",
    (reason) => {
      expect(payerSideReason(reason, null)).toBe(reason);
    },
  );

  it("returns null when neither the header nor the challenge gives a reason", () => {
    expect(payerSideReason(null, null)).toBeNull();
    expect(payerSideReason(null, { error: "" })).toBeNull();
    expect(payerSideReason(null, "not an object")).toBeNull();
  });
});
