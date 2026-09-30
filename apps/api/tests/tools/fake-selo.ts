import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import algosdk from "algosdk";
import { seloNetworks, type SeloNetworkName } from "../../src/payments/networks";
import type { ToolFetch } from "../../src/tools/facilitator-client";

export const seloPayTo = algosdk.generateAccount().addr.toString();
export const inboundTx = "INBOUNDSETTLEMENTTXFROMFAKESELO";

export function seloAccept(name: SeloNetworkName): PaymentRequirements {
  return {
    scheme: "exact",
    network: seloNetworks[name].caip2,
    asset: seloNetworks[name].usdcAssetId,
    amount: "1000000",
    payTo: seloPayTo,
    maxTimeoutSeconds: 300,
    extra: { name: "USDC", decimals: 6, tag: "x402-global-challenge", feePayer: "FEEPAYER" },
  };
}

export interface SeloBehaviour {
  accepts: PaymentRequirements[];
  unpaidStatus: number;
  paidStatus: number;
  paidFails: boolean;
}

export interface SeenRequest {
  readonly url: string;
  readonly headers: Headers;
  readonly body: string;
  readonly redirect: RequestInit["redirect"];
}

export function createFakeSelo(name: SeloNetworkName) {
  const behaviour: SeloBehaviour = {
    accepts: [seloAccept(name)],
    unpaidStatus: 402,
    paidStatus: 200,
    paidFails: false,
  };
  const seen: SeenRequest[] = [];
  const challenge = (): PaymentRequired => ({
    x402Version: 2,
    error: "Payment required",
    resource: {
      url: "https://selo.test/v1/release-test",
      description: "d",
      mimeType: "application/json",
    },
    accepts: behaviour.accepts,
  });
  const fetch: ToolFetch = (input, init) => {
    const headers = new Headers(init?.headers);
    const body = typeof init?.body === "string" ? init.body : "";
    seen.push({ url: input, headers, body, redirect: init?.redirect });
    if (!headers.has("PAYMENT-SIGNATURE")) {
      const status = behaviour.unpaidStatus;
      const extra =
        status === 402
          ? { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(challenge()) }
          : { location: "https://elsewhere.test/v1/release-test" };
      return Promise.resolve(new Response('{"error":"nope"}', { status, headers: extra }));
    }
    if (behaviour.paidFails) {
      return Promise.reject(new TypeError("fetch failed"));
    }
    const settle = { success: true, transaction: inboundTx, network: seloNetworks[name].caip2 };
    return Promise.resolve(
      new Response(JSON.stringify({ jobId: "job_1", verdict: "PASS" }), {
        status: behaviour.paidStatus,
        headers: {
          location: "https://elsewhere.test/v1/release-test",
          "content-type": "application/json",
          "PAYMENT-RESPONSE": encodePaymentResponseHeader(settle),
        },
      }),
    );
  };
  return { fetch, behaviour, seen };
}
