import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { seloNetworks, type SeloNetworkName } from "@selo/api/networks";
import algosdk from "algosdk";
import type { CliFetch } from "../src/http";
import { report } from "./fixtures";

export const seloPayTo = algosdk.generateAccount().addr.toString();

export type PaidReply =
  | { readonly kind: "json"; readonly status: number; readonly body: unknown }
  | { readonly kind: "lost_after_settling" };

export interface SeenRequest {
  readonly path: string;
  readonly method: string;
  readonly headers: Headers;
  readonly body: unknown;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

function bodyOf(init: RequestInit | undefined): unknown {
  return typeof init?.body === "string" ? JSON.parse(init.body) : null;
}

export function createFakeSelo(network: SeloNetworkName = "algorand-testnet") {
  const seen: SeenRequest[] = [];
  const settledByKey = new Map<string, unknown>();
  const state = {
    priceMicros: 1_000_000,
    preflight: () =>
      json(201, {
        eligible: true,
        preflightId: `pfl_TEST${String(seen.filter((r) => r.path === "/v1/preflight").length)}`,
        target: { url: "https://shop.example.com/v1/orders", method: "POST", priceUsdc: "0.01" },
        estimatedMaxSpendUsdc: "0.01",
        seloPriceUsdc: "1.00",
        expiresAt: "2026-10-25T12:15:00.000Z",
      }),
    replies: [] as PaidReply[],
  };
  const challenge = (): PaymentRequired => ({
    x402Version: 2,
    error: "Payment required",
    resource: {
      url: "https://selo.test/v1/release-test",
      description: "d",
      mimeType: "application/json",
    },
    accepts: [
      {
        scheme: "exact",
        network: seloNetworks[network].caip2,
        asset: seloNetworks[network].usdcAssetId,
        amount: String(state.priceMicros),
        payTo: seloPayTo,
        maxTimeoutSeconds: 300,
        extra: { name: "USDC", decimals: 6, tag: "x402-global-challenge", feePayer: "FEEPAYER" },
      },
    ],
  });

  function paid(headers: Headers): Response {
    const key = headers.get("Idempotency-Key") ?? "none";
    const stored = settledByKey.get(key);
    if (stored !== undefined) {
      return json(200, stored);
    }
    const reply = state.replies.shift() ?? { kind: "json", status: 200, body: report("PASS") };
    if (reply.kind === "lost_after_settling") {
      settledByKey.set(key, report("PASS"));
      throw new TypeError("fetch failed: socket hang up");
    }
    if (reply.status === 200) {
      settledByKey.set(key, reply.body);
    }
    const settle = {
      success: true,
      transaction: "INBOUNDTXFROMSELO",
      network: seloNetworks[network].caip2,
    };
    return json(reply.status, reply.body, {
      "PAYMENT-RESPONSE": encodePaymentResponseHeader(settle),
    });
  }

  const fetch: CliFetch = (input, init) => {
    const url = new URL(input);
    const headers = new Headers(init?.headers);
    seen.push({ path: url.pathname, method: init?.method ?? "GET", headers, body: bodyOf(init) });
    try {
      if (url.pathname === "/v1/preflight") {
        return Promise.resolve(state.preflight());
      }
      if (url.pathname === "/v1/release-test" && !headers.has("PAYMENT-SIGNATURE")) {
        const header = encodePaymentRequiredHeader(challenge());
        return Promise.resolve(json(402, {}, { "PAYMENT-REQUIRED": header }));
      }
      if (url.pathname === "/v1/release-test") {
        return Promise.resolve(paid(headers));
      }
      return Promise.resolve(json(404, { error: "NOT_FOUND", message: url.pathname }));
    } catch (error: unknown) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  };

  const paidRequests = () =>
    seen.filter(
      (request) => request.path === "/v1/release-test" && request.headers.has("PAYMENT-SIGNATURE"),
    );

  return { fetch, seen, state, settledByKey, paidRequests };
}

export type FakeSelo = ReturnType<typeof createFakeSelo>;
