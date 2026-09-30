import algosdk from "algosdk";
import { describe, expect, it } from "vitest";
import { seloNetworks } from "../../src/payments/networks";
import { paymentDecision } from "../../src/tools/payment-decision";

const mainnet = seloNetworks["algorand-mainnet"].caip2;
const testnet = seloNetworks["algorand-testnet"].caip2;
const payer = algosdk.generateAccount().addr.toString();
const payTo = algosdk.generateAccount().addr.toString();
const base = { payer, payTo, approvedMainnet: false, amountMicros: 1_000_000, expectedPayTo: null };

describe("paymentDecision", () => {
  it("allows a Testnet payment to a different address", () => {
    expect(paymentDecision({ ...base, network: testnet })).toEqual({
      kind: "allow",
      network: "algorand-testnet",
    });
  });

  it("refuses a Mainnet payment without explicit approval", () => {
    const decision = paymentDecision({ ...base, network: mainnet });
    expect(decision).toMatchObject({ kind: "refuse", reason: "mainnet_not_approved" });
  });

  it("allows a Mainnet payment only with approval and a payer distinct from payTo", () => {
    const approved = { ...base, network: mainnet, approvedMainnet: true, expectedPayTo: payTo };
    expect(paymentDecision(approved)).toEqual({ kind: "allow", network: "algorand-mainnet" });
  });

  it("refuses an approved Mainnet payment without an expected payTo", () => {
    const decision = paymentDecision({ ...base, network: mainnet, approvedMainnet: true });
    expect(decision).toMatchObject({ kind: "refuse", reason: "pay_to_unconfirmed" });
  });

  it("refuses when the 402 payTo differs from the expected payTo, on any network", () => {
    const other = algosdk.generateAccount().addr.toString();
    for (const network of [mainnet, testnet]) {
      const decision = paymentDecision({
        ...base,
        network,
        approvedMainnet: true,
        expectedPayTo: other,
      });
      expect(decision).toMatchObject({ kind: "refuse", reason: "pay_to_mismatch" });
    }
    expect(paymentDecision({ ...base, network: testnet, expectedPayTo: payTo }).kind).toBe("allow");
  });

  it("refuses self-payment on Mainnet even with approval", () => {
    const decision = paymentDecision({
      ...base,
      network: mainnet,
      approvedMainnet: true,
      payTo: payer,
    });
    expect(decision).toMatchObject({ kind: "refuse", reason: "self_payment" });
  });

  it("refuses self-payment on Testnet too", () => {
    const decision = paymentDecision({ ...base, network: testnet, payTo: payer });
    expect(decision).toMatchObject({ kind: "refuse", reason: "self_payment" });
  });

  it("refuses a payer that is one of Selo's own wallets", () => {
    const decision = paymentDecision({ ...base, network: testnet, seloWallets: [payer] });
    expect(decision).toMatchObject({ kind: "refuse", reason: "self_payment" });
    expect(paymentDecision({ ...base, network: testnet, seloWallets: [payTo] }).kind).toBe("allow");
  });

  it("refuses a network that is not Algorand Mainnet or Testnet", () => {
    for (const network of ["eip155:8453", "algorand:mainnet", ""]) {
      expect(paymentDecision({ ...base, network, approvedMainnet: true })).toMatchObject({
        kind: "refuse",
        reason: "unknown_network",
      });
    }
  });

  it("refuses a price above the 5.00 USDC ceiling or a non-positive price", () => {
    for (const amountMicros of [5_000_001, 0, -1, Number.NaN]) {
      expect(paymentDecision({ ...base, network: testnet, amountMicros })).toMatchObject({
        kind: "refuse",
        reason: "price_out_of_bounds",
      });
    }
    expect(paymentDecision({ ...base, network: testnet, amountMicros: 5_000_000 }).kind).toBe(
      "allow",
    );
  });
});
