import { describe, expect, it } from "vitest";
import type { EvaluateHandshakeInput } from "../../src/checks/handshake";
import { evaluateHandshake } from "../../src/checks/handshake";
import {
  isValidPayTo,
  liveAcceptEntry,
  liveChallenge,
  mainnetNetwork,
  mainnetUsdcAsset,
} from "./fixtures";

const policy = { network: mainnetNetwork, asset: mainnetUsdcAsset };
const evidence = ["ev-1"];

function baseInput(overrides: Partial<EvaluateHandshakeInput>): EvaluateHandshakeInput {
  return {
    status: 402,
    decoded: liveChallenge,
    decodeFailed: false,
    policy,
    isValidPayTo,
    evidence,
    ...overrides,
  };
}

describe("evaluateHandshake", () => {
  it.each([
    {
      name: "server error",
      status: 500,
      expectedStatus: "INCONCLUSIVE",
      expectedCode: "TARGET_UNAVAILABLE",
    },
    {
      name: "worse server error",
      status: 503,
      expectedStatus: "INCONCLUSIVE",
      expectedCode: "TARGET_UNAVAILABLE",
    },
  ])("$name maps status >= 500 to $expectedCode", ({ status, expectedStatus, expectedCode }) => {
    const { check, requirement } = evaluateHandshake(baseInput({ status }));
    expect(check.status).toBe(expectedStatus);
    expect(check.code).toBe(expectedCode);
    expect(requirement).toBeNull();
    expect(check.evidence).toBe(evidence);
  });

  it.each([200, 401, 404])("status %i that is not 402 maps to NOT_PAYMENT_REQUIRED", (status) => {
    const { check } = evaluateHandshake(baseInput({ status }));
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("NOT_PAYMENT_REQUIRED");
  });

  it("a 402 with no decoded payload and no decode failure is CHALLENGE_MISSING", () => {
    const { check } = evaluateHandshake(baseInput({ decoded: null, decodeFailed: false }));
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("CHALLENGE_MISSING");
  });

  it("a decode failure is CHALLENGE_MALFORMED even when decoded is null", () => {
    const { check } = evaluateHandshake(baseInput({ decoded: null, decodeFailed: true }));
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("CHALLENGE_MALFORMED");
  });

  it("a decoded payload that fails schema validation is CHALLENGE_MALFORMED", () => {
    const { check } = evaluateHandshake(
      baseInput({ decoded: { not: "a challenge" }, decodeFailed: false }),
    );
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("CHALLENGE_MALFORMED");
  });

  it("an unsupported x402 version is INCONCLUSIVE", () => {
    const { check } = evaluateHandshake(
      baseInput({ decoded: { ...liveChallenge, x402Version: 1 } }),
    );
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.code).toBe("UNSUPPORTED_X402_VERSION");
  });

  it("no accepts entry for the policy network and asset is NO_SUPPORTED_REQUIREMENT", () => {
    const { check, requirement } = evaluateHandshake(
      baseInput({ policy: { network: "algorand:testnet", asset: mainnetUsdcAsset } }),
    );
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("NO_SUPPORTED_REQUIREMENT");
    expect(requirement).toBeNull();
  });

  it("an unparseable amount is PRICE_UNPARSEABLE", () => {
    const { check, requirement } = evaluateHandshake(
      baseInput({
        decoded: { ...liveChallenge, accepts: [{ ...liveAcceptEntry, amount: "abc" }] },
      }),
    );
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("PRICE_UNPARSEABLE");
    expect(requirement?.amountMicros).toBe(0);
  });

  it("a zero amount is PRICE_UNPARSEABLE", () => {
    const { check } = evaluateHandshake(
      baseInput({ decoded: { ...liveChallenge, accepts: [{ ...liveAcceptEntry, amount: "0" }] } }),
    );
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("PRICE_UNPARSEABLE");
  });

  it("an invalid payTo is PAY_TO_INVALID", () => {
    const { check, requirement } = evaluateHandshake(
      baseInput({
        decoded: {
          ...liveChallenge,
          accepts: [{ ...liveAcceptEntry, payTo: "NOT-A-REAL-ADDRESS" }],
        },
      }),
    );
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("PAY_TO_INVALID");
    expect(requirement?.payTo).toBe("NOT-A-REAL-ADDRESS");
  });

  it("a fully valid handshake is PASS with the resolved requirement", () => {
    const { check, requirement } = evaluateHandshake(baseInput({}));
    expect(check.id).toBe("handshake");
    expect(check.status).toBe("PASS");
    expect(check.code).toBe("HANDSHAKE_VALID");
    expect(check.blocking).toBe(true);
    expect(check.evidence).toBe(evidence);
    expect(typeof check.summary).toBe("string");
    expect(requirement).not.toBeNull();
    expect(requirement?.amountMicros).toBe(10_000);
  });
});
