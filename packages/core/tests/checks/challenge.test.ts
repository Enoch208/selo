import { describe, expect, it } from "vitest";
import { bazaarInfo, parseChallenge, selectRequirement } from "../../src/checks/challenge";
import { liveChallenge, mainnetNetwork, mainnetUsdcAsset, merchantPayTo } from "./fixtures";

describe("parseChallenge", () => {
  it("accepts a real-shaped x402 v2 challenge", () => {
    const result = parseChallenge(liveChallenge);
    expect(result.ok).toBe(true);
  });

  it("passes through unknown extension keys instead of stripping them", () => {
    const withUnknownExtension = {
      ...liveChallenge,
      extensions: { ...liveChallenge.extensions, "x402-merchant": { info: { name: "Civitas" } } },
    };
    const result = parseChallenge(withUnknownExtension);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.challenge.extensions?.["x402-merchant"]).toEqual({ info: { name: "Civitas" } });
    }
  });

  it("rejects a payload missing the required accepts array", () => {
    const withoutAccepts = {
      x402Version: liveChallenge.x402Version,
      resource: liveChallenge.resource,
      extensions: liveChallenge.extensions,
    };
    const result = parseChallenge(withoutAccepts);
    expect(result.ok).toBe(false);
  });

  it("rejects a non-object value", () => {
    const result = parseChallenge("not a challenge");
    expect(result.ok).toBe(false);
  });
});

describe("selectRequirement", () => {
  const policy = { network: mainnetNetwork, asset: mainnetUsdcAsset };

  it("selects the matching exact-scheme requirement and parses its amount", () => {
    const parsed = parseChallenge(liveChallenge);
    if (!parsed.ok) {
      throw new Error("fixture challenge must parse");
    }
    const requirement = selectRequirement(parsed.challenge, policy);
    expect(requirement).toEqual({
      scheme: "exact",
      network: mainnetNetwork,
      asset: mainnetUsdcAsset,
      amountMicros: 10_000,
      payTo: merchantPayTo,
      maxTimeoutSeconds: 300,
      extra: liveChallenge.accepts[0]?.extra,
    });
  });

  it("returns null when no accepts entry matches the policy network and asset", () => {
    const parsed = parseChallenge(liveChallenge);
    if (!parsed.ok) {
      throw new Error("fixture challenge must parse");
    }
    const requirement = selectRequirement(parsed.challenge, {
      network: "algorand:testnet",
      asset: mainnetUsdcAsset,
    });
    expect(requirement).toBeNull();
  });

  it("coalesces an unparseable amount to zero rather than throwing", () => {
    const parsed = parseChallenge({
      ...liveChallenge,
      accepts: [{ ...liveChallenge.accepts[0], amount: "not-a-number" }],
    });
    if (!parsed.ok) {
      throw new Error("fixture challenge must parse");
    }
    const requirement = selectRequirement(parsed.challenge, policy);
    expect(requirement?.amountMicros).toBe(0);
  });
});

describe("bazaarInfo", () => {
  it("extracts extensions.bazaar.info from a parsed challenge", () => {
    const parsed = parseChallenge(liveChallenge);
    if (!parsed.ok) {
      throw new Error("fixture challenge must parse");
    }
    expect(bazaarInfo(parsed.challenge)).toEqual(liveChallenge.extensions.bazaar.info);
  });

  it("returns undefined when no bazaar extension is declared", () => {
    const parsed = parseChallenge({ ...liveChallenge, extensions: undefined });
    if (!parsed.ok) {
      throw new Error("fixture challenge must parse");
    }
    expect(bazaarInfo(parsed.challenge)).toBeUndefined();
  });
});
