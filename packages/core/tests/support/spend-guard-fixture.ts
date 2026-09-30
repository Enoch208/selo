import type { SpendGuardInput } from "../../src/spend-guard";

export const fixtureNow = new Date("2026-09-27T12:00:00.000Z");

export function input(overrides: {
  authorization?: SpendGuardInput["authorization"];
  job?: Partial<SpendGuardInput["job"]>;
  payment?: Partial<SpendGuardInput["payment"]>;
  scenarioMaxSpendMicros?: number;
  absoluteCapMicros?: number;
  allowedNetwork?: string;
  allowedAsset?: string;
  now?: Date;
}): SpendGuardInput {
  return {
    authorization:
      overrides.authorization === undefined
        ? {
            status: "VERIFIED",
            origin: "https://target.example",
            expiresAt: new Date("2026-09-28T00:00:00.000Z"),
          }
        : overrides.authorization,
    job: {
      status: "RUNNING",
      maxSpendMicros: 5_000_000,
      settledMicros: 0,
      reservedMicros: 0,
      unresolvedMicros: 0,
      ...overrides.job,
    },
    payment: {
      origin: "https://target.example",
      network: "algorand-testnet",
      asset: "USDC",
      amountMicros: 100_000,
      ...overrides.payment,
    },
    scenarioMaxSpendMicros: overrides.scenarioMaxSpendMicros ?? 1_000_000,
    absoluteCapMicros: overrides.absoluteCapMicros ?? 5_000_000,
    allowedNetwork: overrides.allowedNetwork ?? "algorand-testnet",
    allowedAsset: overrides.allowedAsset ?? "USDC",
    now: overrides.now ?? fixtureNow,
  };
}
