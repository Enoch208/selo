import algosdk from "algosdk";
import { describe, expect, it } from "vitest";
import type { SeloNetworkName } from "../../src/payments/networks";
import { runPayment, type PayFlowDeps, type PayFlowInput } from "../../src/tools/pay-flow";
import { createFakeScheme, type FakeScheme } from "../payments/fake-scheme";
import { createFakeSelo, inboundTx, seloAccept, seloPayTo } from "./fake-selo";

const payer = algosdk.generateAccount().addr.toString();
const input: PayFlowInput = {
  api: "https://selo.test",
  preflightId: "pfl_1",
  expectedStatus: 200,
  approvedMainnet: false,
  expectedPayTo: null,
  idempotencyKey: "pay-selo-stable-key-1",
};
const approved: PayFlowInput = { ...input, approvedMainnet: true, expectedPayTo: seloPayTo };

function harness(network: SeloNetworkName, payerAddress = payer) {
  const selo = createFakeSelo(network);
  const scheme: FakeScheme = createFakeScheme();
  const lines: string[] = [];
  const schemesBuilt: SeloNetworkName[] = [];
  const deps: PayFlowDeps = {
    fetch: selo.fetch,
    payer: payerAddress,
    seloWallets: [],
    schemeFor: (name) => {
      schemesBuilt.push(name);
      return scheme;
    },
    now: () => new Date("2026-09-27T12:00:00.000Z"),
    write: (line) => lines.push(line),
  };
  return { selo, scheme, lines, schemesBuilt, deps };
}

describe("runPayment", () => {
  it("sends the same Idempotency-Key on the paid request of every rerun", async () => {
    const { selo, deps } = harness("algorand-testnet");
    await runPayment(deps, input);
    await runPayment(deps, input);
    const paidKeys = selo.seen
      .filter((request) => request.headers.has("PAYMENT-SIGNATURE"))
      .map((request) => request.headers.get("Idempotency-Key"));
    expect(paidKeys).toEqual([input.idempotencyKey, input.idempotencyKey]);
  });

  it("records the idempotency key so a rerun can reuse it", async () => {
    const { deps } = harness("algorand-testnet");
    const outcome = await runPayment(deps, { ...input, idempotencyKey: "another-key-2" });
    expect(outcome.kind === "completed" && outcome.record.idempotencyKey).toBe("another-key-2");
  });

  it("pays a Testnet 402 exactly once and records the inbound settlement", async () => {
    const { selo, scheme, lines, deps } = harness("algorand-testnet");
    const outcome = await runPayment(deps, input);
    expect(outcome.kind).toBe("completed");
    expect(selo.seen).toHaveLength(2);
    expect(scheme.calls).toHaveLength(1);
    expect(scheme.calls[0]?.requirements).toMatchObject({ payTo: seloPayTo, amount: "1000000" });
    const [unpaid, paid] = selo.seen;
    expect(unpaid?.url).toBe("https://selo.test/v1/release-test");
    expect(JSON.parse(paid?.body ?? "")).toEqual({
      preflightId: "pfl_1",
      profile: "quick",
      expected: { status: 200 },
    });
    expect(outcome.kind === "completed" && outcome.record).toMatchObject({
      network: "algorand-testnet",
      payer,
      payTo: seloPayTo,
      price: "1.00",
      status: 200,
      inboundTxId: inboundTx,
      response: { jobId: "job_1", verdict: "PASS" },
    });
    const output = lines.join("\n");
    expect(output).toContain("1.00 USDC");
    expect(output).toContain(inboundTx);
    const signature = paid?.headers.get("PAYMENT-SIGNATURE") ?? "missing";
    expect(output).not.toContain(signature);
    expect(JSON.stringify(outcome)).not.toContain(signature);
  });

  it("refuses Mainnet without approval before building a signer or paying", async () => {
    const { selo, scheme, schemesBuilt, deps } = harness("algorand-mainnet");
    const outcome = await runPayment(deps, input);
    expect(outcome).toMatchObject({ kind: "refused" });
    expect(outcome.kind === "refused" && outcome.message).toMatch(/--mainnet-i-have-approval/);
    expect(selo.seen).toHaveLength(1);
    expect(schemesBuilt).toEqual([]);
    expect(scheme.calls).toHaveLength(0);
  });

  it("refuses Mainnet self-payment even with approval", async () => {
    const { selo, scheme, deps } = harness("algorand-mainnet", seloPayTo);
    const outcome = await runPayment(deps, approved);
    expect(outcome.kind === "refused" && outcome.message).toMatch(/self-payment/);
    expect(selo.seen).toHaveLength(1);
    expect(scheme.calls).toHaveLength(0);
  });

  it("refuses a payer that is Selo's operating wallet", async () => {
    const { selo, deps } = harness("algorand-testnet");
    const outcome = await runPayment({ ...deps, seloWallets: [payer] }, input);
    expect(outcome.kind === "refused" && outcome.message).toMatch(/own wallet/);
    expect(selo.seen).toHaveLength(1);
  });

  it("pays Mainnet once when approved and the payer is not payTo", async () => {
    const { selo, scheme, deps } = harness("algorand-mainnet");
    const outcome = await runPayment(deps, approved);
    expect(outcome.kind).toBe("completed");
    expect(selo.seen).toHaveLength(2);
    expect(scheme.calls).toHaveLength(1);
  });

  it("refuses an approved Mainnet payment when the 402 payTo is not the expected one", async () => {
    const { selo, scheme, deps } = harness("algorand-mainnet");
    const other = algosdk.generateAccount().addr.toString();
    const outcome = await runPayment(deps, { ...approved, expectedPayTo: other });
    expect(outcome.kind === "refused" && outcome.message).toMatch(/not the expected/);
    expect(selo.seen).toHaveLength(1);
    expect(scheme.calls).toHaveLength(0);
  });

  it("refuses an approved Mainnet payment with no expected payTo", async () => {
    const { selo, deps } = harness("algorand-mainnet");
    const outcome = await runPayment(deps, { ...input, approvedMainnet: true });
    expect(outcome.kind === "refused" && outcome.message).toMatch(/--pay-to/);
    expect(selo.seen).toHaveLength(1);
  });

  it("sends both requests with redirect manual", async () => {
    const { selo, deps } = harness("algorand-testnet");
    await runPayment(deps, input);
    expect(selo.seen.map((request) => request.redirect)).toEqual(["manual", "manual"]);
  });

  it("refuses an unpaid redirect without signing or following it", async () => {
    const { selo, scheme, deps } = harness("algorand-testnet");
    selo.behaviour.unpaidStatus = 307;
    const outcome = await runPayment(deps, input);
    expect(outcome.kind === "refused" && outcome.message).toMatch(
      /target redirected \(HTTP 307 to https:\/\/elsewhere\.test.*nothing further sent/,
    );
    expect(selo.seen).toHaveLength(1);
    expect(scheme.calls).toHaveLength(0);
  });

  it("stops on a paid redirect and does not follow it", async () => {
    const { selo, deps } = harness("algorand-testnet");
    selo.behaviour.paidStatus = 308;
    const outcome = await runPayment(deps, input);
    expect(outcome.kind).toBe("unknown");
    expect(outcome.kind === "unknown" && outcome.message).toMatch(
      /redirected.*nothing further sent/,
    );
    expect(selo.seen).toHaveLength(2);
    expect(selo.seen.every((request) => request.url === "https://selo.test/v1/release-test")).toBe(
      true,
    );
  });

  it("maps a signing failure to a refusal that says nothing was sent", async () => {
    const { selo, scheme, deps } = harness("algorand-testnet");
    scheme.failWith = new Error("signer exploded");
    const outcome = await runPayment(deps, input);
    expect(outcome).toEqual({ kind: "refused", message: "signer exploded; nothing was sent" });
    expect(selo.seen).toHaveLength(1);
  });

  it("does not retry when the paid request is rejected", async () => {
    const { selo, scheme, deps } = harness("algorand-testnet");
    selo.behaviour.paidStatus = 402;
    const outcome = await runPayment(deps, input);
    expect(outcome.kind === "completed" && outcome.record.status).toBe(402);
    expect(selo.seen).toHaveLength(2);
    expect(scheme.calls).toHaveLength(1);
  });

  it("reports an unknown outcome and stops when the paid request fails in transit", async () => {
    const { selo, deps } = harness("algorand-testnet");
    selo.behaviour.paidFails = true;
    const outcome = await runPayment(deps, input);
    expect(outcome.kind).toBe("unknown");
    expect(outcome.kind === "unknown" && outcome.message).toMatch(/do not pay again/i);
    expect(selo.seen).toHaveLength(2);
  });

  it("refuses when the unpaid request is not a 402", async () => {
    const { selo, deps } = harness("algorand-testnet");
    selo.behaviour.unpaidStatus = 400;
    const outcome = await runPayment(deps, input);
    expect(outcome.kind === "refused" && outcome.message).toMatch(/400/);
    expect(selo.seen).toHaveLength(1);
  });

  it("refuses a 402 that offers more than one Algorand USDC requirement", async () => {
    const { selo, scheme, deps } = harness("algorand-testnet");
    selo.behaviour.accepts = [seloAccept("algorand-testnet"), seloAccept("algorand-mainnet")];
    const outcome = await runPayment(deps, input);
    expect(outcome.kind === "refused" && outcome.message).toMatch(/exactly one/);
    expect(scheme.calls).toHaveLength(0);
  });
});
