import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { describe, expect, it } from "vitest";
import { loadEnv } from "../src/env";

const secretsLeftBlankInExample: Readonly<Record<string, string>> = {
  SELO_PAY_TO: "A4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DVZ36IB4",
};

function exampleEnv(): Record<string, string> {
  const parsed = parseEnv(readFileSync(new URL("../.env.example", import.meta.url), "utf8"));
  const filled: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    filled[key] = value === "" ? (secretsLeftBlankInExample[key] ?? value) : (value ?? "");
  }
  return filled;
}

describe(".env.example", () => {
  it("loads through loadEnv exactly as tsx --env-file would read it", () => {
    expect(() => loadEnv(exampleEnv())).not.toThrow();
  });

  it("keeps the example on Testnet and within the spend caps", () => {
    const env = loadEnv(exampleEnv());
    expect(env.SELO_NETWORK).toBe("algorand-testnet");
    expect(env.SELO_JOB_MAX_SPEND_MICROS).toBeLessThanOrEqual(env.SELO_ABSOLUTE_MAX_SPEND_MICROS);
  });
});
