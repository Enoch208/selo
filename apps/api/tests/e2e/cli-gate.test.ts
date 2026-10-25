import { mkdtempSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import algosdk from "algosdk";
import { describe, expect, it } from "vitest";
import { runCli } from "../../../../packages/cli/src/cli";
import type { TestContext } from "../../../../packages/cli/src/commands/test";
import { captureOutput, useOrchestratorHarness } from "../orchestrator/harness";
import { createFakeScheme } from "../payments/fake-scheme";
import { DemoDeployment, demoUrl } from "./demo-deployment";
import { authorizeByWellKnownFile, seloFor, seloInbound } from "./demo-flow";

useOrchestratorHarness();
captureOutput();

const merchantFile = (name: string): string =>
  createRequire(import.meta.url).resolve(`@selo/example-merchant/${name}`);

async function gate(deployment: DemoDeployment, release: string) {
  const selo = await seloFor(deployment);
  const authorization = await authorizeByWellKnownFile(selo, deployment);
  const dir = mkdtempSync(join(tmpdir(), "selo-cli-gate-"));
  const lines: string[] = [];
  const payer = algosdk.generateAccount();
  const scheme = createFakeScheme();
  const ctx: TestContext = {
    fetch: (input, init) => Promise.resolve(selo.request(input, init)),
    out: { line: (text) => lines.push(text), error: (text) => lines.push(text) },
    payerMnemonic: algosdk.secretKeyToMnemonic(payer.sk),
    wallet: () => ({ payer: payer.addr.toString(), schemeFor: () => scheme }),
    now: () => new Date(),
    stateDir: join(dir, "runs"),
    stepSummaryFile: join(dir, "step-summary.md"),
  };
  const summaryFile = join(dir, "gate.json");
  const exitCode = await runCli(
    [
      "test",
      "--api",
      "https://selo.example",
      "--authorization",
      authorization.authorizationId,
      "--url",
      demoUrl,
      "--method",
      "POST",
      "--body",
      merchantFile("order.json"),
      "--contract",
      merchantFile("contract.json"),
      "--release",
      release,
      "--network",
      "testnet",
      "--max-usdc",
      "1.00",
      "--summary",
      summaryFile,
    ],
    ctx,
  );
  const summary: unknown = JSON.parse(readFileSync(summaryFile, "utf8"));
  return { exitCode, summary, lines };
}

describe("selo test gates the demo merchant through the real Selo API", () => {
  it("blocks broken-v1 with exit 1 and allows fixed-v2 with exit 0 at the same URL", async () => {
    seloInbound.reset();
    const deployment = new DemoDeployment("broken-v1");
    const broken = await gate(deployment, "broken-v1");
    deployment.ship("fixed-v2");
    const fixed = await gate(deployment, "fixed-v2");

    expect(broken.exitCode).toBe(1);
    expect(broken.summary).toMatchObject({
      gate: "BLOCK",
      verdict: "FAIL",
      reason: "FAIL: response_contract",
      release: { id: "broken-v1", verification: "asserted_by_client" },
    });
    expect(fixed.exitCode).toBe(0);
    expect(fixed.summary).toMatchObject({ gate: "ALLOW", verdict: "PASS", exitCode: 0 });
    expect(seloInbound.settleCalls()).toHaveLength(2);
    expect(deployment.facilitator.settled).toHaveLength(2);
    expect(broken.lines.join("\n")).toMatch(/response_contract\s+FAIL\s+SCHEMA_MISMATCH/);
  });
});
