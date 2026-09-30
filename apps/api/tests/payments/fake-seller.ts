import {
  decodePaymentSignatureHeader,
  encodePaymentRequiredHeader,
  encodePaymentResponseHeader,
} from "@x402/core/http";
import type { PaymentPayload, PaymentRequired, PaymentRequirements } from "@x402/core/types";
import algosdk from "algosdk";
import { Hono, type Context } from "hono";
import { seloNetworks } from "../../src/payments/networks";

export const testnet = seloNetworks["algorand-testnet"].caip2;
export const payTo = algosdk.generateAccount().addr.toString();
export const settlementTx = "SETTLEDTXIDFROMTHEFAKESELLER";
export const settleFailure = "invalid_exact_avm_payload_transaction";

export const offeredAccept: PaymentRequirements = {
  scheme: "exact",
  network: testnet,
  asset: seloNetworks["algorand-testnet"].usdcAssetId,
  amount: "10000",
  payTo,
  maxTimeoutSeconds: 60,
  extra: { name: "USDC", decimals: 6, tag: "x402-global-challenge", feePayer: "FEEPAYER" },
};

export const pricierAccept: PaymentRequirements = { ...offeredAccept, amount: "900000" };

export const cheaperElsewhereAccept: PaymentRequirements = {
  ...offeredAccept,
  amount: "5000",
  payTo: algosdk.generateAccount().addr.toString(),
};

export const challengeFor = (url: string): PaymentRequired => ({
  x402Version: 2,
  error: "payment required",
  resource: { url, description: "fake paid resource", mimeType: "application/json" },
  accepts: [cheaperElsewhereAccept, pricierAccept, offeredAccept],
  extensions: { bazaar: { info: { note: "kept" } } },
});

export type SettlementMode = "settled" | "failed" | "malformed" | "absent";

export interface SellerBehaviour {
  paidStatus: number;
  settlement: SettlementMode;
  body: string;
}

export interface Received {
  idempotencyKey: string;
  method: string;
  contentType: string | null;
  body: string;
}

async function received(c: Context): Promise<Received> {
  return {
    idempotencyKey: c.req.header("Idempotency-Key") ?? "",
    method: c.req.method,
    contentType: c.req.header("content-type") ?? null,
    body: await c.req.text(),
  };
}

export interface FakeSeller {
  readonly app: Hono;
  readonly behaviour: SellerBehaviour;
  readonly paidRequests: (Received & { signature: string; payload: PaymentPayload })[];
  readonly unpaidRequests: Received[];
}

function settlementHeader(mode: SettlementMode): Record<string, string> {
  if (mode === "absent") {
    return {};
  }
  if (mode === "malformed") {
    return { "PAYMENT-RESPONSE": "%%%not-a-settlement%%%" };
  }
  const settle =
    mode === "settled"
      ? { success: true, transaction: settlementTx, network: testnet }
      : { success: false, transaction: "", network: testnet, errorReason: settleFailure };
  return { "PAYMENT-RESPONSE": encodePaymentResponseHeader(settle) };
}

export function createFakeSeller(): FakeSeller {
  const behaviour: SellerBehaviour = { paidStatus: 200, settlement: "settled", body: '{"ok":1}' };
  const paidRequests: FakeSeller["paidRequests"] = [];
  const unpaidRequests: FakeSeller["unpaidRequests"] = [];
  const app = new Hono();

  app.get("/no-header", (c) => c.json({}, 402));
  app.get("/malformed", (c) => {
    c.header("PAYMENT-REQUIRED", "!!!not-base64!!!");
    return c.json({}, 402);
  });
  app.on(["GET", "POST"], "/paid", async (c) => {
    const request = await received(c);
    const signature = c.req.header("PAYMENT-SIGNATURE");
    if (signature === undefined) {
      unpaidRequests.push(request);
      c.header("PAYMENT-REQUIRED", encodePaymentRequiredHeader(challengeFor(c.req.url)));
      return c.json({}, 402);
    }
    paidRequests.push({ ...request, signature, payload: decodePaymentSignatureHeader(signature) });
    return new Response(behaviour.body, {
      status: behaviour.paidStatus,
      headers: { "content-type": "application/json", ...settlementHeader(behaviour.settlement) },
    });
  });

  return { app, behaviour, paidRequests, unpaidRequests };
}

export const sellerFetch =
  (seller: FakeSeller) =>
  (input: string, init: RequestInit): Promise<Response> =>
    Promise.resolve(seller.app.request(input, init));
