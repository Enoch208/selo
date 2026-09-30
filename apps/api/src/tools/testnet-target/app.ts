import { ExactAvmScheme } from "@x402/avm/exact/server";
import { x402ResourceServer, type FacilitatorClient } from "@x402/core/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { paymentMiddleware } from "@x402/hono";
import { Hono } from "hono";
import { seloNetworks } from "../../payments/networks";

export const testnetQuotePath = "/v1/quote";
export const testnetQuotePriceMicros = 10_000;
export const testnetQuote = { quote: 42, currency: "USD", network: "algorand-testnet" } as const;

export interface TestnetTargetConfig {
  readonly facilitator: FacilitatorClient;
  readonly payTo: string;
  readonly verificationLine: string | null;
}

export function createTestnetTargetApp(config: TestnetTargetConfig) {
  const testnet = seloNetworks["algorand-testnet"];
  const server = new x402ResourceServer(config.facilitator)
    .register(testnet.caip2, new ExactAvmScheme())
    .registerExtension(bazaarResourceServerExtension);
  const routes = {
    [`GET ${testnetQuotePath}`]: {
      accepts: {
        scheme: "exact",
        network: testnet.caip2,
        price: {
          asset: testnet.usdcAssetId,
          amount: String(testnetQuotePriceMicros),
          extra: { name: "USDC", decimals: 6 },
        },
        payTo: config.payTo,
        maxTimeoutSeconds: 120,
      },
      description:
        "Selo's Algorand Testnet demo target: returns a fixed price quote for 0.01 Testnet USDC, used to prove Selo's round trip without real funds.",
      mimeType: "application/json",
      extensions: { ...declareDiscoveryExtension({ output: { example: testnetQuote } }) },
    },
  };
  return new Hono()
    .get("/.well-known/selo-verification.txt", (c) =>
      config.verificationLine === null ? c.notFound() : c.text(`${config.verificationLine}\n`),
    )
    .use(paymentMiddleware(routes, server))
    .get(testnetQuotePath, (c) => c.json(testnetQuote));
}
