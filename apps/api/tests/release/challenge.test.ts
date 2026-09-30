import type { SupportedResponse } from "@x402/core/types";
import { describe, expect, it } from "vitest";
import { createInboundGate } from "../../src/payments/inbound";
import { releaseTestDescription } from "../../src/release/discovery";
import { FakeFacilitator } from "../support/fake-facilitator";
import {
  decodeChallenge,
  facilitator,
  mainnet,
  priceMicros,
  releaseTest,
  resourceUrl,
  runner,
  seedPreflight,
  seloPayTo,
  useReleaseHarness,
} from "./harness";

useReleaseHarness();

async function unpaidChallenge() {
  const preflightId = await seedPreflight();
  const response = await releaseTest({ preflightId, profile: "quick" });
  return { response, required: decodeChallenge(response) };
}

describe("the unpaid release-test challenge", () => {
  it("A01: an unpaid valid request returns 402", async () => {
    const { response } = await unpaidChallenge();
    expect(response.status).toBe(402);
    expect(facilitator.calls).toHaveLength(0);
    expect(runner.runs).toHaveLength(0);
  });

  it("A02: the 402 declares Algorand Mainnet, USDC 31566704 and the configured payTo", async () => {
    const { required } = await unpaidChallenge();
    expect(required.x402Version).toBe(2);
    expect(required.accepts).toHaveLength(1);
    expect(required.accepts[0]).toMatchObject({
      scheme: "exact",
      network: "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=",
      asset: "31566704",
      amount: String(priceMicros),
      payTo: seloPayTo,
      maxTimeoutSeconds: 300,
    });
    expect(mainnet.caip2).toBe("algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=");
    expect(required.resource).toMatchObject({
      url: resourceUrl,
      description: releaseTestDescription,
      mimeType: "application/json",
      serviceName: "Selo",
    });
  });

  it("A03: the 402 carries the x402-global-challenge tag", async () => {
    const { required } = await unpaidChallenge();
    expect(required.resource.tags).toEqual(["x402-global-challenge"]);
    expect(required.accepts[0]?.extra).toMatchObject({
      tag: "x402-global-challenge",
      name: "USDC",
      decimals: 6,
      feePayer: "ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA",
    });
  });

  it("A04: the 402 carries Bazaar discovery metadata", async () => {
    const { required } = await unpaidChallenge();
    expect(required.extensions?.bazaar).toMatchObject({
      info: {
        input: {
          type: "http",
          method: "POST",
          bodyType: "json",
          body: { profile: "quick", preflightId: expect.stringMatching(/^pfl_/) as unknown },
        },
        output: {
          type: "json",
          example: { verdict: "PASS", money: expect.any(Object) as unknown },
        },
      },
      schema: {
        properties: { input: { properties: { body: { required: ["preflightId", "profile"] } } } },
      },
    });
  });
});

describe("merchant identity", () => {
  it("the 402 declares Selo's merchant name and categories for the leaderboard", async () => {
    const { required } = await unpaidChallenge();
    expect(required.resource.iconUrl).toBe("https://useselo.xyz/brand/selo-logo-512.png");
    expect(required.extensions?.["x402-merchant"]).toMatchObject({
      info: {
        name: "Selo",
        categories: ["x402", "algorand", "developer-tools", "testing", "x402-global-challenge"],
      },
      schema: { type: "object", required: ["name"] },
    });
  });
});

describe("starting the inbound gate", () => {
  it("refuses to start when the facilitator cannot list its supported kinds", async () => {
    const unreachable = new FakeFacilitator();
    unreachable.getSupported = () => Promise.reject(new TypeError("fetch failed"));
    await expect(
      createInboundGate({
        facilitator: unreachable,
        network: mainnet.caip2,
        usdcAssetId: mainnet.usdcAssetId,
        payTo: seloPayTo,
        priceMicros,
        resourceUrl,
        facilitatorUrl: "https://facilitator.test",
      }),
    ).rejects.toThrow(/Selo cannot start.*https:\/\/facilitator\.test/);
  });

  it("refuses to start when the facilitator does not support the configured network", async () => {
    const testnetOnly = new FakeFacilitator();
    const supported: SupportedResponse = await testnetOnly.getSupported();
    testnetOnly.getSupported = () =>
      Promise.resolve({
        ...supported,
        kinds: supported.kinds.filter((kind) => kind.network !== mainnet.caip2),
      });
    await expect(
      createInboundGate({
        facilitator: testnetOnly,
        network: mainnet.caip2,
        usdcAssetId: mainnet.usdcAssetId,
        payTo: seloPayTo,
        priceMicros,
        resourceUrl,
        facilitatorUrl: "https://facilitator.test",
      }),
    ).rejects.toThrow(/Selo cannot start/);
  });
});
