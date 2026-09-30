import { describe, expect, it } from "vitest";
import { bazaarInfo, parseChallenge, selectRequirement } from "../../src/checks/challenge";
import type { CatalogLookup } from "../../src/checks/discovery";
import { evaluateDiscovery } from "../../src/checks/discovery";
import { evaluateHandshake } from "../../src/checks/handshake";
import { liveAgentkeepCapture402, ownCapture402 } from "./ground-truth-fixtures";

const mainnetNetwork = "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=";
const mainnetUsdcAsset = "31566704";
const policy = { network: mainnetNetwork, asset: mainnetUsdcAsset };
const evidence = ["ground-truth-ev"];
const alwaysValidPayTo = (): boolean => true;

describe("own capture (POST, Bazaar extension, installed @x402 2.27.0)", () => {
  it("parses end to end", () => {
    const parsed = parseChallenge(ownCapture402);
    expect(parsed.ok).toBe(true);
  });

  it("selects the requirement with the amount and payTo from the capture", () => {
    const parsed = parseChallenge(ownCapture402);
    if (!parsed.ok) {
      throw new Error("own capture must parse");
    }
    const requirement = selectRequirement(parsed.challenge, policy);
    expect(requirement?.amountMicros).toBe(1_000_000);
    expect(requirement?.payTo).toBe("XMBY7EABEU6YPDJRCBISZDFM4MPYLHH5V6TVWYDU5LIIT2NC3SGHKANNQI");
  });

  it("evaluates PASS HANDSHAKE_VALID with a permissive payTo validator", () => {
    const { check, requirement } = evaluateHandshake({
      status: 402,
      decoded: ownCapture402,
      decodeFailed: false,
      policy,
      isValidPayTo: alwaysValidPayTo,
      evidence,
    });
    expect(check.status).toBe("PASS");
    expect(check.code).toBe("HANDSHAKE_VALID");
    expect(check.evidence).toBe(evidence);
    expect(requirement?.amountMicros).toBe(1_000_000);
    expect(requirement?.payTo).toBe("XMBY7EABEU6YPDJRCBISZDFM4MPYLHH5V6TVWYDU5LIIT2NC3SGHKANNQI");
  });

  it("bazaarInfo returns the POST-shaped discovery info verbatim", () => {
    const parsed = parseChallenge(ownCapture402);
    if (!parsed.ok) {
      throw new Error("own capture must parse");
    }
    expect(bazaarInfo(parsed.challenge)).toEqual(ownCapture402.extensions.bazaar.info);
  });
});

describe("live agentkeep capture (GET, vendor-heavy extra, live Mainnet merchant)", () => {
  it("parses end to end", () => {
    const parsed = parseChallenge(liveAgentkeepCapture402);
    expect(parsed.ok).toBe(true);
  });

  it("selects the requirement with the amount, payTo and passthrough extra from the capture", () => {
    const parsed = parseChallenge(liveAgentkeepCapture402);
    if (!parsed.ok) {
      throw new Error("agentkeep capture must parse");
    }
    const requirement = selectRequirement(parsed.challenge, policy);
    expect(requirement?.amountMicros).toBe(1_000);
    expect(requirement?.payTo).toBe("2VIU2N25S2TRAJ54ZTUY5CSFADU6Y5KEMKAWTRWR2ODNTPULNGHBKWEPTQ");
    expect(requirement?.extra).toEqual(liveAgentkeepCapture402.accepts[0]?.extra);
  });

  it("evaluates PASS HANDSHAKE_VALID with a permissive payTo validator", () => {
    const { check, requirement } = evaluateHandshake({
      status: 402,
      decoded: liveAgentkeepCapture402,
      decodeFailed: false,
      policy,
      isValidPayTo: alwaysValidPayTo,
      evidence,
    });
    expect(check.status).toBe("PASS");
    expect(check.code).toBe("HANDSHAKE_VALID");
    expect(requirement?.amountMicros).toBe(1_000);
  });
});

describe("C5 discovery against the POST-shaped own capture's live info", () => {
  it("a target called with GET while the live info declares POST is FAIL LIVE_METHOD_MISMATCH", () => {
    const parsed = parseChallenge(ownCapture402);
    if (!parsed.ok) {
      throw new Error("own capture must parse");
    }
    const requirement = selectRequirement(parsed.challenge, policy);
    if (requirement === null) {
      throw new Error("own capture must select a requirement");
    }
    const liveInfo = bazaarInfo(parsed.challenge);
    const catalog: CatalogLookup = { kind: "not_found" };
    const check = evaluateDiscovery({
      target: { url: ownCapture402.resource.url, method: "GET" as const },
      requirement,
      liveInfo,
      liveResource: {
        description: ownCapture402.resource.description,
        mimeType: ownCapture402.resource.mimeType,
      },
      catalog,
      evidence,
    });
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("LIVE_METHOD_MISMATCH");
  });

  it("a POST target consistent with the live info and a matching catalog record is PASS DISCOVERY_CONSISTENT", () => {
    const parsed = parseChallenge(ownCapture402);
    if (!parsed.ok) {
      throw new Error("own capture must parse");
    }
    const requirement = selectRequirement(parsed.challenge, policy);
    if (requirement === null) {
      throw new Error("own capture must select a requirement");
    }
    const liveInfo = bazaarInfo(parsed.challenge);
    const catalog: CatalogLookup = {
      kind: "found",
      record: {
        id: "own-record",
        resourceUrl: ownCapture402.resource.url,
        method: "POST",
        description: ownCapture402.resource.description,
        mimeType: ownCapture402.resource.mimeType,
        merchantId: "own-merchant",
        accepts: ownCapture402.accepts,
        discoveryInfo: liveInfo,
        settleCount: 1,
        firstSeen: "2026-09-27T00:00:00.000Z",
        lastSeen: "2026-09-27T00:00:00.000Z",
      },
    };
    const check = evaluateDiscovery({
      target: { url: ownCapture402.resource.url, method: "POST" as const },
      requirement,
      liveInfo,
      liveResource: {
        description: ownCapture402.resource.description,
        mimeType: ownCapture402.resource.mimeType,
      },
      catalog,
      evidence,
    });
    expect(check.status).toBe("PASS");
    expect(check.code).toBe("DISCOVERY_CONSISTENT");
  });
});
