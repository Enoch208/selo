import { describe, expect, it } from "vitest";
import { spendDenialReasons } from "../src/contract";
import { evaluateSpend, type SpendGuardInput } from "../src/spend-guard";
import { input } from "./support/spend-guard-fixture";

describe("evaluateSpend precedence", () => {
  it("reports the first failing check in contract order when several fail", () => {
    const everythingWrong = input({
      authorization: null,
      job: { status: "QUEUED", unresolvedMicros: 1 },
      payment: { origin: "https://other.example", network: "x", asset: "y" },
    });
    expect(evaluateSpend(everythingWrong)).toEqual({
      allowed: false,
      reason: "AUTHORIZATION_INVALID",
    });
  });

  it("peels failures off one at a time in exactly the order of spendDenialReasons", () => {
    const observed: string[] = [];
    let current = input({
      authorization: {
        status: "PENDING",
        origin: "https://target.example",
        expiresAt: new Date("2000-01-01T00:00:00.000Z"),
      },
      job: { status: "QUEUED", unresolvedMicros: 1, maxSpendMicros: 50_000 },
      payment: {
        origin: "https://other.example",
        network: "bad-network",
        asset: "bad-asset",
        amountMicros: 100_000,
      },
      scenarioMaxSpendMicros: 1,
      absoluteCapMicros: 5_000_000,
    });
    const fixes: ((value: SpendGuardInput) => SpendGuardInput)[] = [
      (value) =>
        value.authorization === null
          ? value
          : { ...value, authorization: { ...value.authorization, status: "VERIFIED" } },
      (value) =>
        value.authorization === null
          ? value
          : {
              ...value,
              authorization: { ...value.authorization, expiresAt: new Date("2027-01-01") },
            },
      (value) => ({ ...value, job: { ...value.job, status: "RUNNING" } }),
      (value) => ({ ...value, payment: { ...value.payment, origin: "https://target.example" } }),
      (value) => ({ ...value, payment: { ...value.payment, network: "algorand-testnet" } }),
      (value) => ({ ...value, payment: { ...value.payment, asset: "USDC" } }),
      (value) => ({ ...value, job: { ...value.job, unresolvedMicros: 0 } }),
      (value) => ({ ...value, scenarioMaxSpendMicros: 10_000_000 }),
      (value) => ({ ...value, job: { ...value.job, maxSpendMicros: 6_000_000 } }),
      (value) => ({ ...value, absoluteCapMicros: 6_000_000 }),
    ];
    for (const fix of fixes) {
      const result = evaluateSpend(current);
      if (!result.allowed) {
        observed.push(result.reason);
      }
      current = fix(current);
    }
    expect(observed).toEqual(spendDenialReasons);
    expect(evaluateSpend(current).allowed).toBe(true);
  });
});
