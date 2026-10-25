import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { compileContract, evaluateResponseContract } from "@selo/core";
import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader,
} from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import algosdk from "algosdk";
import { describe, expect, it } from "vitest";
import contract from "../contract.json" with { type: "json" };
import order from "../order.json" with { type: "json" };
import { createMerchantApp, merchantDescription, ordersPath } from "../src/app";
import { merchantNetworks } from "../src/networks";
import { orderSchema, receiptSchema, type Release } from "../src/orders";
import { FakeFacilitator } from "./fake-facilitator";

const network = merchantNetworks["algorand-testnet"];
const payTo = algosdk.generateAccount().addr.toString();
const publicOrigin = "https://merchant.test";

function merchant(release: Release, verificationFile: string | null = null) {
  const facilitator = new FakeFacilitator();
  const app = createMerchantApp({
    release,
    network,
    payTo,
    publicOrigin,
    facilitator,
    verificationFile,
  });
  return { app, facilitator };
}

type MerchantApp = ReturnType<typeof merchant>["app"];

const postOrder = (app: MerchantApp, body: unknown, headers: Record<string, string> = {}) =>
  app.request(ordersPath, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

function challengeOf(response: Response): PaymentRequired {
  const header = response.headers.get("PAYMENT-REQUIRED");
  if (header === null) {
    throw new Error(`expected PAYMENT-REQUIRED on HTTP ${String(response.status)}`);
  }
  return decodePaymentRequiredHeader(header);
}

function signatureFor(required: PaymentRequired, variant: string): string {
  const [accepted] = required.accepts;
  if (accepted === undefined) {
    throw new Error("the 402 offered no requirement");
  }
  const encode = (text: string) => Buffer.from(text).toString("base64");
  return encodePaymentSignatureHeader({
    x402Version: 2,
    resource: required.resource,
    accepted,
    payload: {
      paymentGroup: [encode(`fee-payer-${variant}`), encode(`usdc-transfer-${variant}`)],
      paymentIndex: 1,
    },
  });
}

async function paidOrder(release: Release, variant = "a") {
  const { app, facilitator } = merchant(release);
  const signature = signatureFor(challengeOf(await postOrder(app, order)), variant);
  const response = await postOrder(app, order, { "PAYMENT-SIGNATURE": signature });
  return { response, bodyText: await response.text(), facilitator };
}

function contractVerdict(status: number, contentType: string | null, bodyText: string) {
  const compiled = compileContract(contract);
  if (!compiled.ok) {
    throw new Error(compiled.issue);
  }
  return evaluateResponseContract({
    contract: compiled.contract,
    observed: { status, contentType, bodyText },
    evidence: ["ev_paid_response"],
  });
}

describe("demo merchant", () => {
  it.each(["broken-v1", "fixed-v2"] as const)("%s passes an ordinary health check", async (r) => {
    const response = await merchant(r).app.request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", release: r });
  });

  it.each(["broken-v1", "fixed-v2"] as const)(
    "%s answers unpaid with one x402 challenge",
    async (r) => {
      const challenge = challengeOf(await postOrder(merchant(r).app, order));
      expect(challenge.accepts).toHaveLength(1);
      expect(challenge.accepts[0]).toMatchObject({
        scheme: "exact",
        network: network.caip2,
        asset: network.usdcAssetId,
        amount: "10000",
        payTo,
      });
      expect(challenge.resource).toMatchObject({
        url: `${publicOrigin}${ordersPath}`,
        description: merchantDescription,
        mimeType: "application/json",
      });
      expect(challenge.extensions?.bazaar).toMatchObject({
        info: { input: { method: "POST", bodyType: "json" } },
        schema: { properties: { output: { properties: { example: receiptSchema } } } },
      });
    },
  );

  it("declares the same challenge for both releases", async () => {
    const broken = challengeOf(await postOrder(merchant("broken-v1").app, order));
    const fixed = challengeOf(await postOrder(merchant("fixed-v2").app, order));
    expect(broken).toEqual(fixed);
  });

  it("broken-v1 settles and answers 200, but its paid body fails the release contract", async () => {
    const { response, bodyText, facilitator } = await paidOrder("broken-v1");
    expect(response.status).toBe(200);
    expect(facilitator.settled).toHaveLength(1);
    const settlement = decodePaymentResponseHeader(response.headers.get("PAYMENT-RESPONSE") ?? "");
    expect(settlement).toMatchObject({ success: true, transaction: "MERCHANTTX1" });
    const result = contractVerdict(200, response.headers.get("content-type"), bodyText);
    expect(result).toMatchObject({ status: "FAIL", code: "SCHEMA_MISMATCH" });
    expect(result.summary).toContain("receiptId");
  });

  it("fixed-v2 settles and its paid body matches the release contract", async () => {
    const { response, bodyText, facilitator } = await paidOrder("fixed-v2");
    expect(response.status).toBe(200);
    expect(facilitator.settled).toHaveLength(1);
    const result = contractVerdict(200, response.headers.get("content-type"), bodyText);
    expect(result).toMatchObject({ status: "PASS", code: "CONTRACT_MATCHED" });
  });

  it("derives the receipt from the signed payment, so one payment yields one receipt", async () => {
    const first = JSON.parse((await paidOrder("fixed-v2", "a")).bodyText) as unknown;
    const again = JSON.parse((await paidOrder("fixed-v2", "a")).bodyText) as unknown;
    const other = JSON.parse((await paidOrder("fixed-v2", "b")).bodyText) as unknown;
    expect(again).toEqual(first);
    expect(other).not.toEqual(first);
  });

  it("refuses a malformed order without settling the payment", async () => {
    const { app, facilitator } = merchant("fixed-v2");
    const signature = signatureFor(challengeOf(await postOrder(app, order)), "a");
    const response = await postOrder(
      app,
      { sku: "demo-widget" },
      { "PAYMENT-SIGNATURE": signature },
    );
    expect(response.status).toBe(400);
    expect(facilitator.settled).toHaveLength(0);
  });

  it("serves the owner's verification file and 404s without one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "merchant-verify-"));
    const file = join(dir, "selo-verification.txt");
    writeFileSync(file, "selo-verification=abc123\n");
    const served = await merchant("fixed-v2", file).app.request(
      "/.well-known/selo-verification.txt",
    );
    expect(await served.text()).toBe("selo-verification=abc123\n");
    const missing = merchant("fixed-v2", join(dir, "absent.txt")).app;
    expect((await missing.request("/.well-known/selo-verification.txt")).status).toBe(404);
    expect(
      (await merchant("fixed-v2").app.request("/.well-known/selo-verification.txt")).status,
    ).toBe(404);
  });

  it("ships a contract equal to the schema it advertises and a valid example order", () => {
    expect(contract.jsonSchema).toEqual(receiptSchema);
    expect(orderSchema.safeParse(order).success).toBe(true);
  });
});
