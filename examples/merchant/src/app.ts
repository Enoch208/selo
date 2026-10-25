import { readFile } from "node:fs/promises";
import { ExactAvmScheme } from "@x402/avm/exact/server";
import { x402ResourceServer, type FacilitatorClient } from "@x402/core/server";
import { bazaarResourceServerExtension, declareDiscoveryExtension } from "@x402/extensions/bazaar";
import { paymentMiddleware } from "@x402/hono";
import { Hono, type Context } from "hono";
import type { MerchantNetwork } from "./networks";
import {
  exampleOrder,
  exampleReceipt,
  fulfil,
  orderInputSchema,
  orderSchema,
  receiptSchema,
  type Order,
  type Release,
} from "./orders";

export const ordersPath = "/v1/orders";
export const orderPriceMicros = 10_000;
export const merchantDescription =
  "Selo's demo merchant: places one demo order for 0.01 USDC and returns its receipt. Owned by the Selo team for controlled release-gate demonstrations.";

const maxVerificationBytes = 4096;

export interface MerchantConfig {
  readonly release: Release;
  readonly network: MerchantNetwork;
  readonly payTo: string;
  readonly publicOrigin: string;
  readonly facilitator: FacilitatorClient;
  readonly verificationFile: string | null;
}

const isMissingFile = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

async function verificationText(path: string | null): Promise<string | null> {
  if (path === null) {
    return null;
  }
  try {
    return (await readFile(path, "utf8")).slice(0, maxVerificationBytes);
  } catch (error: unknown) {
    if (isMissingFile(error)) {
      return null;
    }
    throw error;
  }
}

async function readOrder(c: Context): Promise<Order | null> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return null;
  }
  const parsed = orderSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

function protectedRoutes(config: MerchantConfig) {
  return {
    [`POST ${ordersPath}`]: {
      accepts: {
        scheme: "exact",
        network: config.network.caip2,
        price: {
          asset: config.network.usdcAssetId,
          amount: String(orderPriceMicros),
          extra: { name: "USDC", decimals: 6 },
        },
        payTo: config.payTo,
        maxTimeoutSeconds: 120,
      },
      resource: `${config.publicOrigin}${ordersPath}`,
      description: merchantDescription,
      mimeType: "application/json",
      extensions: {
        ...declareDiscoveryExtension({
          bodyType: "json",
          input: exampleOrder,
          inputSchema: orderInputSchema,
          output: { example: exampleReceipt, schema: receiptSchema },
        }),
      },
    },
  };
}

export function createMerchantApp(config: MerchantConfig) {
  const server = new x402ResourceServer(config.facilitator)
    .register(config.network.caip2, new ExactAvmScheme())
    .registerExtension(bazaarResourceServerExtension);
  return new Hono()
    .get("/health", (c) => c.json({ status: "ok", release: config.release }))
    .get("/.well-known/selo-verification.txt", async (c) => {
      const text = await verificationText(config.verificationFile);
      return text === null ? c.notFound() : c.text(text);
    })
    .use(paymentMiddleware(protectedRoutes(config), server))
    .post(ordersPath, async (c) => {
      const signature = c.req.header("PAYMENT-SIGNATURE");
      const order = await readOrder(c);
      if (signature === undefined) {
        return c.json({ error: "PAYMENT_REQUIRED" }, 402);
      }
      if (order === null) {
        return c.json({ error: "INVALID_ORDER", message: "Expected { sku, quantity }" }, 400);
      }
      return c.json(fulfil(config.release, order, signature));
    });
}
