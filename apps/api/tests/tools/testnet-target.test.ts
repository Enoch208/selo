import { decodePaymentRequiredHeader } from "@x402/core/http";
import algosdk from "algosdk";
import { describe, expect, it } from "vitest";
import { seloNetworks } from "../../src/payments/networks";
import { roleNetworkGate } from "../../src/tools/account-chain";
import {
  createTestnetTargetApp,
  testnetQuotePath,
  testnetQuotePriceMicros,
} from "../../src/tools/testnet-target/app";
import { FakeFacilitator } from "../support/fake-facilitator";

const payTo = algosdk.generateAccount().addr.toString();
const appWith = (verificationLine: string | null) =>
  createTestnetTargetApp({ facilitator: new FakeFacilitator(), payTo, verificationLine });

describe("the Testnet demo target", () => {
  it("answers an unpaid request with a 402 for Testnet USDC only", async () => {
    const response = await appWith(null).request(testnetQuotePath);
    expect(response.status).toBe(402);
    const header = response.headers.get("PAYMENT-REQUIRED");
    expect(header).not.toBeNull();
    const required = decodePaymentRequiredHeader(header ?? "");
    const testnet = seloNetworks["algorand-testnet"];
    expect(required.accepts).toEqual([
      expect.objectContaining({
        network: testnet.caip2,
        asset: testnet.usdcAssetId,
        amount: String(testnetQuotePriceMicros),
        payTo,
      }),
    ]);
    expect(
      required.accepts.some((accept) => accept.network === seloNetworks["algorand-mainnet"].caip2),
    ).toBe(false);
  });

  it("serves the verification line when one is configured", async () => {
    const response = await appWith("selo-verification=abc123_-").request(
      "/.well-known/selo-verification.txt",
    );
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("selo-verification=abc123_-\n");
  });

  it("serves no verification file when none is configured", async () => {
    const response = await appWith(null).request("/.well-known/selo-verification.txt");
    expect(response.status).toBe(404);
  });
});

describe("the testnet-target wallet", () => {
  it("is refused on Mainnet and allowed on Testnet", () => {
    expect(roleNetworkGate("testnet-target", "algorand-mainnet").ok).toBe(false);
    expect(roleNetworkGate("testnet-target", "algorand-testnet").ok).toBe(true);
    expect(roleNetworkGate("operator", "algorand-mainnet").ok).toBe(true);
  });
});
