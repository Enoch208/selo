import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SeloNetworkName } from "@selo/api/networks";
import algosdk from "algosdk";
import { runCli } from "../src/cli";
import type { TestContext } from "../src/commands/test";
import { createFakeSelo } from "./fake-selo";
import { offlineScheme } from "./fixtures";

export const contract = {
  status: 200,
  contentType: "application/json",
  jsonSchema: {
    type: "object",
    required: ["receiptId"],
    properties: { receiptId: { type: "string" } },
  },
};

export function cliHarness(network: SeloNetworkName = "algorand-testnet") {
  const selo = createFakeSelo(network);
  const payer = algosdk.generateAccount();
  const mnemonic = algosdk.secretKeyToMnemonic(payer.sk);
  const scheme = offlineScheme(payer);
  const dir = mkdtempSync(join(tmpdir(), "selo-cli-"));
  const contractFile = join(dir, "contract.json");
  const bodyFile = join(dir, "order.json");
  const summaryFile = join(dir, "out", "gate.json");
  const stepSummaryFile = join(dir, "step-summary.md");
  writeFileSync(contractFile, JSON.stringify(contract));
  writeFileSync(bodyFile, JSON.stringify({ sku: "demo-widget", quantity: 1 }));
  const lines: string[] = [];
  const errors: string[] = [];
  const ctx: TestContext = {
    fetch: selo.fetch,
    out: { line: (text) => lines.push(text), error: (text) => errors.push(text) },
    payerMnemonic: mnemonic,
    wallet: () => ({ payer: payer.addr.toString(), schemeFor: () => scheme }),
    now: () => new Date("2026-10-25T12:00:00.000Z"),
    stateDir: join(dir, "runs"),
    stepSummaryFile,
  };
  const testArgs = (extra: readonly string[] = []) => [
    "test",
    "--api",
    "https://selo.test",
    "--authorization",
    "auth_TEST1",
    "--url",
    "https://shop.example.com/v1/orders",
    "--method",
    "POST",
    "--body",
    bodyFile,
    "--contract",
    contractFile,
    "--release",
    "abc123",
    "--network",
    network === "algorand-testnet" ? "testnet" : "mainnet",
    "--max-usdc",
    "1.00",
    "--summary",
    summaryFile,
    ...extra,
  ];
  const run = (extra: readonly string[] = [], context: TestContext = ctx) =>
    runCli(testArgs(extra), context);
  const output = () => [...lines, ...errors].join("\n");
  return {
    selo,
    payer,
    mnemonic,
    scheme,
    dir,
    ctx,
    lines,
    errors,
    summaryFile,
    stepSummaryFile,
    run,
    output,
  };
}
