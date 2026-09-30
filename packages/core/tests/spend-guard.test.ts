import { describe, expect, it } from "vitest";
import { spendDenialReasons } from "../src/contract";
import { availableMicros, evaluateSpend, spendGuardChecks } from "../src/spend-guard";
import { fixtureNow, input } from "./support/spend-guard-fixture";

describe("evaluateSpend", () => {
  it("allows a payment that passes every check", () => {
    expect(evaluateSpend(input({}))).toEqual({ allowed: true });
  });

  it.each([
    ["AUTHORIZATION_INVALID", input({ authorization: null })],
    [
      "AUTHORIZATION_INVALID",
      input({
        authorization: {
          status: "PENDING",
          origin: "https://target.example",
          expiresAt: fixtureNow,
        },
      }),
    ],
    [
      "AUTHORIZATION_EXPIRED",
      input({
        authorization: {
          status: "VERIFIED",
          origin: "https://target.example",
          expiresAt: new Date("2026-09-27T11:59:59.000Z"),
        },
      }),
    ],
    ["JOB_NOT_RUNNING", input({ job: { status: "QUEUED" } })],
    ["ORIGIN_NOT_AUTHORIZED", input({ payment: { origin: "https://other.example" } })],
    ["NETWORK_NOT_ALLOWED", input({ payment: { network: "algorand-mainnet" } })],
    ["ASSET_NOT_ALLOWED", input({ payment: { asset: "ALGO" } })],
    ["PAYMENT_UNRESOLVED", input({ job: { unresolvedMicros: 1 } })],
    [
      "SCENARIO_BUDGET_EXCEEDED",
      input({ scenarioMaxSpendMicros: 99_999, payment: { amountMicros: 100_000 } }),
    ],
    [
      "JOB_BUDGET_EXCEEDED",
      input({ job: { maxSpendMicros: 99_999 }, payment: { amountMicros: 100_000 } }),
    ],
    [
      "ABSOLUTE_CAP_EXCEEDED",
      input({ job: { maxSpendMicros: 6_000_000 }, absoluteCapMicros: 5_000_000 }),
    ],
  ] as const)("denies with %s, every other check passing", (reason, request) => {
    expect(evaluateSpend(request)).toEqual({ allowed: false, reason });
  });

  it("allows spending exactly at the scenario, job, and absolute caps", () => {
    const request = input({
      job: { maxSpendMicros: 1_000_000 },
      scenarioMaxSpendMicros: 100_000,
      absoluteCapMicros: 1_000_000,
      payment: { amountMicros: 100_000 },
    });
    expect(evaluateSpend(request).allowed).toBe(true);
  });

  it("denies one micro over the scenario, job, or absolute cap", () => {
    expect(
      evaluateSpend(input({ scenarioMaxSpendMicros: 100_000, payment: { amountMicros: 100_001 } })),
    ).toEqual({ allowed: false, reason: "SCENARIO_BUDGET_EXCEEDED" });
    expect(
      evaluateSpend(
        input({ job: { maxSpendMicros: 100_000 }, payment: { amountMicros: 100_001 } }),
      ),
    ).toEqual({ allowed: false, reason: "JOB_BUDGET_EXCEEDED" });
    expect(
      evaluateSpend(input({ job: { maxSpendMicros: 1_000_001 }, absoluteCapMicros: 1_000_000 })),
    ).toEqual({ allowed: false, reason: "ABSOLUTE_CAP_EXCEEDED" });
  });

  it.each([0, -1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    "throws before any check for an invalid amount %s",
    (amount) => {
      expect(() =>
        evaluateSpend(input({ authorization: null, payment: { amountMicros: amount } })),
      ).toThrow(RangeError);
    },
  );

  it("exposes the checks in contract order for reports", () => {
    expect(spendGuardChecks.map((c) => c.reason)).toEqual(spendDenialReasons);
  });
});

describe("availableMicros", () => {
  it("subtracts settled, reserved, and unresolved from the max", () => {
    expect(
      availableMicros({
        status: "RUNNING",
        maxSpendMicros: 1_000_000,
        settledMicros: 200_000,
        reservedMicros: 100_000,
        unresolvedMicros: 50_000,
      }),
    ).toBe(650_000);
  });

  it("throws when the books are corrupt", () => {
    expect(() =>
      availableMicros({
        status: "RUNNING",
        maxSpendMicros: 100,
        settledMicros: 50,
        reservedMicros: 50,
        unresolvedMicros: 50,
      }),
    ).toThrow(RangeError);
  });
});
