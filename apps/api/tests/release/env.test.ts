import { describe, expect, it } from "vitest";
import { loadEnv, payToWarning } from "../../src/env";

const validPayTo = "A4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DVZ36IB4";

const base = {
  DATABASE_URL: "postgres://selo@localhost:54330/selo",
  PUBLIC_BASE_URL: "http://localhost:8787",
  SELO_PAY_TO: validPayTo,
};

describe("inbound payment configuration", () => {
  it("accepts a valid payTo and defaults the facilitator to GoPlausible", () => {
    const env = loadEnv(base);
    expect(env.SELO_PAY_TO).toBe(validPayTo);
    expect(env.FACILITATOR_URL).toBe("https://facilitator.goplausible.xyz");
  });

  it("refuses to load without a payTo address", () => {
    expect(() => loadEnv({ ...base, SELO_PAY_TO: undefined })).toThrow(/SELO_PAY_TO/);
  });

  it("refuses a payTo that is not an Algorand address", () => {
    expect(() => loadEnv({ ...base, SELO_PAY_TO: `${validPayTo.slice(0, -1)}A` })).toThrow(
      /SELO_PAY_TO/,
    );
  });

  it("refuses a Mainnet configuration whose public URL is not public HTTPS", () => {
    expect(() => loadEnv({ ...base, SELO_NETWORK: "algorand-mainnet" })).toThrow(/PUBLIC_BASE_URL/);
    expect(() =>
      loadEnv({ ...base, SELO_NETWORK: "algorand-mainnet", PUBLIC_BASE_URL: "https://127.0.0.1" }),
    ).toThrow(/PUBLIC_BASE_URL/);
    expect(
      loadEnv({ ...base, SELO_NETWORK: "algorand-mainnet", PUBLIC_BASE_URL: "https://selo.dev" })
        .SELO_NETWORK,
    ).toBe("algorand-mainnet");
  });

  it("refuses a facilitator URL that is not https", () => {
    expect(() => loadEnv({ ...base, FACILITATOR_URL: "http://facilitator.test" })).toThrow(
      /FACILITATOR_URL/,
    );
    expect(loadEnv({ ...base, FACILITATOR_URL: "https://facilitator.test" }).FACILITATOR_URL).toBe(
      "https://facilitator.test",
    );
  });
});

describe("payTo versus the operating wallet", () => {
  it("warns when inbound revenue goes to a different address than the paying wallet", () => {
    const otherAddress = "B4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4";
    const warning = payToWarning(validPayTo, otherAddress);
    expect(warning).toContain(validPayTo);
    expect(warning).toContain(otherAddress);
    expect(warning).toMatch(/will not refill/);
  });

  it("stays silent when payTo is the operating wallet", () => {
    expect(payToWarning(validPayTo, validPayTo)).toBeNull();
  });
});
