import { ExactAvmScheme } from "@x402/avm/exact/server";
import { x402HTTPResourceServer, x402ResourceServer } from "@x402/core/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { paymentMiddlewareFromHTTPServer } from "@x402/hono";
import algosdk from "algosdk";
import { Hono } from "hono";
import { SafeFetchError, type SafeFetchOptions } from "../../src/net/safe-fetch";
import { seloNetworks } from "../../src/payments/networks";
import type { FetchLike } from "../../src/payments/transport";
import { TargetFacilitator } from "./target-facilitator";

export const targetNetwork = seloNetworks["algorand-testnet"];
export const targetOrigin = "https://api.example.com";
export const targetPath = "/v1/quote";
export const targetUrl = `${targetOrigin}${targetPath}`;
export const targetPayTo = algosdk.generateAccount().addr.toString();
export const quoteExample = { quote: 42, currency: "USD" };

export type ReplayCache = "none" | "stored_result" | "fresh_result";

export interface TargetRequest {
  readonly paid: boolean;
  readonly signature: string | null;
  readonly idempotencyKey: string | null;
  readonly allowedOrigin: string;
  readonly timeoutMs: number;
}

export class StockSeller {
  readonly facilitator = new TargetFacilitator();
  readonly requests: TargetRequest[] = [];
  readonly app = new Hono();
  priceMicros = 10_000;
  handlerStatus = 200;
  handlerBody: unknown = quoteExample;
  hangPaid = false;
  unpaidFailure: SafeFetchError | null = null;
  unpaidOverride: (() => Response) | null = null;
  onPaid: () => void | Promise<void> = () => undefined;
  replayCache: ReplayCache = "none";
  readonly storedResults = new Map<string, string>();

  constructor() {
    const server = new x402ResourceServer(this.facilitator)
      .register(targetNetwork.caip2, new ExactAvmScheme())
      .registerExtension(bazaarResourceServerExtension);
    const http = new x402HTTPResourceServer(server, {
      [`GET ${targetPath}`]: {
        accepts: [
          {
            scheme: "exact",
            network: targetNetwork.caip2,
            price: () => ({
              asset: targetNetwork.usdcAssetId,
              amount: String(this.priceMicros),
              extra: { name: "USDC", decimals: 6 },
            }),
            payTo: targetPayTo,
            maxTimeoutSeconds: 60,
          },
        ],
        description: "A paid price quote",
        mimeType: "application/json",
        extensions: { ...declareDiscoveryExtension({ output: { example: quoteExample } }) },
      },
    });
    this.app.use(async (c, next) => {
      if (this.hangPaid && c.req.header("PAYMENT-SIGNATURE") !== undefined) {
        return new Promise<Response>(() => undefined);
      }
      await next();
    });
    this.app.use(paymentMiddlewareFromHTTPServer(http));
    this.app.get(
      targetPath,
      () =>
        new Response(JSON.stringify(this.handlerBody), {
          status: this.handlerStatus,
          headers: { "content-type": "application/json" },
        }),
    );
  }

  reset(): void {
    this.facilitator.reset();
    this.requests.length = 0;
    this.priceMicros = 10_000;
    this.handlerStatus = 200;
    this.handlerBody = quoteExample;
    this.hangPaid = false;
    this.unpaidFailure = null;
    this.unpaidOverride = null;
    this.onPaid = () => undefined;
    this.replayCache = "none";
    this.storedResults.clear();
  }

  paidRequests(): readonly TargetRequest[] {
    return this.requests.filter((request) => request.paid);
  }

  readonly fetchFor = (options: SafeFetchOptions): FetchLike => {
    return async (input, init) => {
      const headers = new Headers(init.headers);
      const signature = headers.get("PAYMENT-SIGNATURE");
      this.requests.push({
        paid: signature !== null,
        signature,
        idempotencyKey: headers.get("Idempotency-Key"),
        allowedOrigin: options.allowedOrigin,
        timeoutMs: options.timeoutMs,
      });
      if (signature !== null) {
        await this.onPaid();
      }
      if (signature === null && this.unpaidFailure !== null) {
        throw this.unpaidFailure;
      }
      if (signature === null && this.unpaidOverride !== null) {
        return this.unpaidOverride();
      }
      const cached = signature === null ? undefined : this.storedResults.get(signature);
      if (cached !== undefined && this.replayCache !== "none") {
        const body =
          this.replayCache === "stored_result" ? cached : JSON.stringify({ ...quoteExample, n: 2 });
        return new Response(body, { status: 200, headers: { "content-type": "application/json" } });
      }
      const response = await this.app.request(input, init);
      if (signature !== null && response.status === 200) {
        this.storedResults.set(signature, await response.clone().text());
      }
      return response;
    };
  };
}

export const probeNetworkError = (): SafeFetchError =>
  new SafeFetchError({ kind: "network" }, new Error("connect ECONNRESET"), true);
