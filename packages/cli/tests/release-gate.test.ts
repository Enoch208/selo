import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { failingReport, inconclusiveReport, passingChecks, report, reportToken } from "./fixtures";
import { seloPayTo } from "./fake-selo";
import { cliHarness, contract } from "./harness";

const readJson = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));

describe("selo test exit codes", () => {
  it("exits 0 and allows promotion only on a fully evidenced PASS", async () => {
    const h = cliHarness();
    expect(await h.run()).toBe(0);
    expect(readJson(h.summaryFile)).toMatchObject({
      schema: "selo.gate.v1",
      gate: "ALLOW",
      exitCode: 0,
      verdict: "PASS",
      release: { id: "abc123", verification: "asserted_by_client" },
      money: { seloInboundTxId: "INBOUNDTXFROMSELO", downstreamTxIds: ["DOWNSTREAMTXTOTARGET"] },
      report: "https://selo.test/v1/reports/<private>",
    });
    expect(readFileSync(h.stepSummaryFile, "utf8")).toContain("ALLOW: release may be promoted");
  });

  it("exits 1 and blocks on a FAIL proven by a release check", async () => {
    const h = cliHarness();
    h.selo.state.replies.push({ kind: "json", status: 200, body: failingReport() });
    expect(await h.run()).toBe(1);
    expect(readJson(h.summaryFile)).toMatchObject({ gate: "BLOCK", exitCode: 1, verdict: "FAIL" });
    expect(readFileSync(h.stepSummaryFile, "utf8")).toContain("BLOCK: do not promote");
  });

  it("exits 2 on INCONCLUSIVE", async () => {
    const h = cliHarness();
    h.selo.state.replies.push({ kind: "json", status: 200, body: inconclusiveReport() });
    expect(await h.run()).toBe(2);
    expect(readJson(h.summaryFile)).toMatchObject({ gate: "BLOCK", verdict: "INCONCLUSIVE" });
  });

  it("exits 2 when a report claims PASS that its own checks do not support", async () => {
    const h = cliHarness();
    const checks = passingChecks().map((check) =>
      check.id === "paid_delivery" ? { ...check, status: "FAIL" as const } : check,
    );
    h.selo.state.replies.push({ kind: "json", status: 200, body: report("PASS", checks) });
    expect(await h.run()).toBe(2);
    expect(h.output()).toMatch(/does not follow from its checks/);
  });

  it("exits 2 when a PASS lacks a check, evidence or a payment leg", async () => {
    const variants = [
      report("PASS", passingChecks().slice(0, 4)),
      report(
        "PASS",
        passingChecks().map((check) => ({ ...check, evidence: [] })),
      ),
      { ...report("PASS"), money: { ...report("PASS").money, downstreamTxIds: [] } },
      { ...report("PASS"), money: { ...report("PASS").money, seloInboundTxId: "" } },
    ];
    for (const body of variants) {
      const h = cliHarness();
      h.selo.state.replies.push({ kind: "json", status: 200, body });
      expect(await h.run()).toBe(2);
    }
  });

  it("exits 2 when the answer is not a report at all", async () => {
    const h = cliHarness();
    h.selo.state.replies.push({ kind: "json", status: 200, body: { verdict: "PASS" } });
    expect(await h.run()).toBe(2);
  });

  it("exits 3 on an ineligible preflight without asking for payment", async () => {
    const h = cliHarness();
    h.selo.state.preflight = () =>
      new Response(
        JSON.stringify({
          eligible: false,
          preflightId: "pfl_X",
          reason: "PRICE_OVER_BUDGET",
          message: "too dear",
        }),
        { status: 422 },
      );
    expect(await h.run()).toBe(3);
    expect(h.selo.seen.map((request) => request.path)).toEqual(["/v1/preflight"]);
  });

  it("exits 3 when the target is not authorized", async () => {
    const h = cliHarness();
    h.selo.state.preflight = () =>
      new Response(
        JSON.stringify({
          eligible: false,
          preflightId: null,
          reason: "AUTHORIZATION_MISSING",
          message: "no",
        }),
        { status: 403 },
      );
    expect(await h.run()).toBe(3);
    expect(h.scheme.signed).toHaveLength(0);
  });

  it("exits 3 when Selo answers the paid request with 402, and nothing is charged", async () => {
    const h = cliHarness();
    h.selo.state.replies.push({ kind: "json", status: 402, body: { error: "insufficient_funds" } });
    expect(await h.run()).toBe(3);
    expect(readJson(join(h.dir, "runs", "abc123.json"))).toMatchObject({ phase: "rejected" });
  });
});

describe("selo test payment safety", () => {
  it("exits 3 on a contract file that does not compile, before any request", async () => {
    const h = cliHarness();
    const bad = join(h.dir, "bad-contract.json");
    writeFileSync(bad, JSON.stringify({ jsonSchema: { type: "object", required: ["receiptId"] } }));
    expect(await h.run(["--contract", bad])).toBe(3);
    expect(h.output()).toMatch(/not usable/);
    expect(h.selo.seen).toHaveLength(0);
  });

  it("exits 2 when Selo cannot be reached, without paying", async () => {
    const h = cliHarness();
    const down = () => Promise.reject(new TypeError("fetch failed"));
    expect(await h.run([], { ...h.ctx, fetch: down })).toBe(2);
    expect(h.scheme.signed).toHaveLength(0);
  });

  it("refuses Mainnet without --approve-mainnet and --pay-to before any request", async () => {
    const h = cliHarness("algorand-mainnet");
    expect(await h.run()).toBe(3);
    expect(await h.run(["--approve-mainnet"])).toBe(3);
    expect(h.selo.seen).toHaveLength(0);
  });

  it("pays Mainnet once with approval and the expected payTo", async () => {
    const h = cliHarness("algorand-mainnet");
    expect(await h.run(["--approve-mainnet", "--pay-to", seloPayTo])).toBe(0);
    expect(h.selo.paidRequests()).toHaveLength(1);
  });

  it("refuses a 402 on another network than --network before signing", async () => {
    const h = cliHarness("algorand-mainnet");
    const testnetArgs = ["--network", "testnet"];
    expect(await h.run(testnetArgs)).toBe(3);
    expect(h.output()).toMatch(/not the expected algorand-testnet/);
    expect(h.scheme.signed).toHaveLength(0);
  });

  it("refuses a Selo price above --max-usdc before signing", async () => {
    const h = cliHarness();
    expect(await h.run(["--max-usdc", "0.50"])).toBe(3);
    expect(h.output()).toMatch(/above the approved budget of 0\.50 USDC/);
    expect(h.scheme.signed).toHaveLength(0);
  });

  it("refuses to run without a payer wallet or with an invalid one", async () => {
    const h = cliHarness();
    expect(await h.run([], { ...h.ctx, payerMnemonic: undefined })).toBe(3);
    const broken = () => {
      throw new Error("operating wallet mnemonic is invalid");
    };
    expect(await h.run([], { ...h.ctx, wallet: broken })).toBe(3);
    expect(h.selo.seen).toHaveLength(0);
  });

  it("rejects unsupported methods and networks explicitly", async () => {
    const h = cliHarness();
    expect(await h.run(["--method", "PUT"])).toBe(3);
    expect(await h.run(["--network", "base"])).toBe(3);
    expect(h.selo.seen).toHaveLength(0);
  });

  it("sends the contract and the release id with a stable Idempotency-Key", async () => {
    const h = cliHarness();
    await h.run();
    const [paid] = h.selo.paidRequests();
    expect(paid?.headers.get("Idempotency-Key")).toMatch(/^selo-cli-[0-9a-f]{48}$/);
    expect(paid?.body).toEqual({
      preflightId: "pfl_TEST1",
      profile: "quick",
      expected: contract,
      deploymentId: "abc123",
    });
  });

  it("holds an unresolved settlement and never pays again without --resume", async () => {
    const h = cliHarness();
    h.selo.state.replies.push({
      kind: "json",
      status: 502,
      body: { error: "INBOUND_SETTLEMENT_UNRESOLVED", message: "held", jobId: "job_1", txId: null },
    });
    expect(await h.run()).toBe(2);
    const state = readJson(join(h.dir, "runs", "abc123.json"));
    expect(state).toMatchObject({ phase: "unresolved", preflightId: "pfl_TEST1" });
    const seenBefore = h.selo.seen.length;
    expect(await h.run()).toBe(2);
    expect(h.selo.seen).toHaveLength(seenBefore);
    expect(h.output()).toMatch(/Do not start a new paid run/);
  });

  it("recovers an interrupted paid call by resuming, settling only once", async () => {
    const h = cliHarness();
    h.selo.state.replies.push({ kind: "lost_after_settling" });
    expect(await h.run()).toBe(2);
    expect(readJson(join(h.dir, "runs", "abc123.json"))).toMatchObject({ phase: "unresolved" });
    expect(h.output()).toMatch(/Check the payer account for transaction [A-Z2-7]{52}/);

    expect(await h.run()).toBe(2);
    expect(h.selo.paidRequests()).toHaveLength(1);

    expect(await h.run(["--resume"])).toBe(0);
    const paid = h.selo.paidRequests();
    expect(paid).toHaveLength(2);
    expect(new Set(paid.map((request) => request.headers.get("Idempotency-Key"))).size).toBe(1);
    expect(paid.map((request) => request.body)).toEqual([paid[0]?.body, paid[0]?.body]);
    expect(h.selo.seen.filter((request) => request.path === "/v1/preflight")).toHaveLength(1);
    expect(h.selo.settledByKey.size).toBe(1);
    expect(readJson(join(h.dir, "runs", "abc123.json"))).toMatchObject({
      phase: "concluded",
      verdict: "PASS",
    });
  });

  it("keeps a run unresolved when resuming meets a job still in progress", async () => {
    const h = cliHarness();
    h.selo.state.replies.push({
      kind: "json",
      status: 500,
      body: { error: "INTERNAL", message: "x" },
    });
    expect(await h.run()).toBe(2);
    h.selo.state.replies.push({
      kind: "json",
      status: 409,
      body: { error: "JOB_IN_PROGRESS", message: "wait" },
    });
    expect(await h.run(["--resume"])).toBe(2);
    expect(readJson(join(h.dir, "runs", "abc123.json"))).toMatchObject({ phase: "unresolved" });
  });

  it("refuses --resume when there is nothing unresolved to resume", async () => {
    const h = cliHarness();
    expect(await h.run(["--resume"])).toBe(3);
    await h.run();
    expect(await h.run(["--resume"])).toBe(3);
  });

  it("starts a fresh paid run after a concluded one", async () => {
    const h = cliHarness();
    expect(await h.run()).toBe(0);
    expect(await h.run()).toBe(0);
    expect(h.selo.paidRequests()).toHaveLength(2);
    expect(h.selo.settledByKey.size).toBe(2);
  });
});

describe("selo test secrecy", () => {
  it("never prints or stores the mnemonic, the signed payment or the report token", async () => {
    const h = cliHarness();
    await h.run();
    const signature = h.selo.paidRequests()[0]?.headers.get("PAYMENT-SIGNATURE") ?? "missing";
    expect(signature.length).toBeGreaterThan(100);
    const state = readFileSync(join(h.dir, "runs", "abc123.json"), "utf8");
    const published = {
      output: h.output(),
      summary: readFileSync(h.summaryFile, "utf8"),
      stepSummary: readFileSync(h.stepSummaryFile, "utf8"),
    };
    const words = h.mnemonic.split(" ");
    for (const [where, text] of Object.entries({ ...published, state })) {
      expect(text, where).not.toContain(signature);
      for (let start = 0; start + 3 <= words.length; start += 1) {
        expect(text, where).not.toContain(words.slice(start, start + 3).join(" "));
      }
    }
    for (const [where, text] of Object.entries(published)) {
      expect(text, where).not.toContain(reportToken);
    }
    expect(statSync(join(h.dir, "runs", "abc123.json")).mode & 0o777).toBe(0o600);
  });
});
