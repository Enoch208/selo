import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import algosdk from "algosdk";
import { describe, expect, it } from "vitest";
import { loadOperatorEnv } from "../../src/env";
import { operatorMnemonic } from "./mnemonic-scheme";

const secret = "r".repeat(32);
const base = { SELO_OPERATOR_MNEMONIC: operatorMnemonic, REPORT_TOKEN_SECRET: secret };

function thrownMessage(action: () => unknown): string {
  try {
    action();
  } catch (error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected the loader to throw");
}

describe("operator configuration", () => {
  it("derives the operating address and applies the defaults", () => {
    const env = loadOperatorEnv(base);
    expect(env.operatingAddress).toBe(
      algosdk.mnemonicToSecretKey(operatorMnemonic).addr.toString(),
    );
    expect(env.REPORTS_DIR).toBe("reports");
    expect(env.JOB_WALL_CLOCK_MS).toBe(60_000);
    expect(env.REPORT_TOKEN_SECRET).toBe(secret);
  });

  it("refuses to start without a mnemonic or with a report secret under 32 characters", () => {
    expect(() => loadOperatorEnv({ REPORT_TOKEN_SECRET: secret })).toThrow(
      /SELO_OPERATOR_MNEMONIC/,
    );
    expect(() => loadOperatorEnv({ ...base, REPORT_TOKEN_SECRET: "short" })).toThrow(
      /REPORT_TOKEN_SECRET/,
    );
  });

  it("refuses a mnemonic that does not yield a valid address and never echoes it", () => {
    const words = operatorMnemonic.split(" ");
    const broken = [...words.slice(0, 24), words[0] === "abandon" ? "zoo" : "abandon"].join(" ");
    const message = thrownMessage(() =>
      loadOperatorEnv({ ...base, SELO_OPERATOR_MNEMONIC: broken }),
    );
    expect(message).toMatch(/SELO_OPERATOR_MNEMONIC/);
    for (let start = 0; start + 3 <= words.length; start += 1) {
      expect(message).not.toContain(words.slice(start, start + 3).join(" "));
    }
    const short = thrownMessage(() =>
      loadOperatorEnv({ ...base, SELO_OPERATOR_MNEMONIC: words.slice(0, 12).join(" ") }),
    );
    expect(short).toMatch(/SELO_OPERATOR_MNEMONIC/);
    expect(short).not.toContain(words.slice(0, 12).join(" "));
  });

  it("is declared in .env.example with the secrets left blank", () => {
    const parsed = parseEnv(readFileSync(new URL("../../.env.example", import.meta.url), "utf8"));
    expect(parsed.SELO_OPERATOR_MNEMONIC).toBe("");
    expect(parsed.REPORT_TOKEN_SECRET).toBe("");
    expect(loadOperatorEnv({ ...parsed, ...base })).toMatchObject({
      REPORTS_DIR: parsed.REPORTS_DIR,
      JOB_WALL_CLOCK_MS: Number(parsed.JOB_WALL_CLOCK_MS),
    });
  });
});
