import { serve } from "@hono/node-server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import algosdk from "algosdk";
import { z } from "zod";
import { createMerchantApp, ordersPath } from "./app";
import { merchantNetworkNames, merchantNetworks } from "./networks";
import { releases } from "./orders";

const localHosts = new Set(["localhost", "127.0.0.1"]);

const publicOrigin = z
  .url()
  .transform((value) => new URL(value))
  .refine(
    (url) =>
      url.protocol === "https:" || (url.protocol === "http:" && localHosts.has(url.hostname)),
    { message: "must be an https origin (http only for localhost)" },
  )
  .transform((url) => url.origin);

const envSchema = z.object({
  MERCHANT_RELEASE: z.enum(releases),
  MERCHANT_NETWORK: z.enum(merchantNetworkNames),
  MERCHANT_PAY_TO: z.string().refine((value) => algosdk.isValidAddress(value), {
    message: "must be a valid Algorand address",
  }),
  MERCHANT_PUBLIC_ORIGIN: publicOrigin,
  FACILITATOR_URL: z.url().default("https://facilitator.goplausible.xyz"),
  SELO_VERIFICATION_FILE: z.string().min(1).optional(),
  PORT: z.coerce.number().int().positive().default(8791),
  HOST: z.string().min(1).default("127.0.0.1"),
});

const env = envSchema.parse(process.env);
const app = createMerchantApp({
  release: env.MERCHANT_RELEASE,
  network: merchantNetworks[env.MERCHANT_NETWORK],
  payTo: env.MERCHANT_PAY_TO,
  publicOrigin: env.MERCHANT_PUBLIC_ORIGIN,
  facilitator: new HTTPFacilitatorClient({ url: env.FACILITATOR_URL }),
  verificationFile: env.SELO_VERIFICATION_FILE ?? null,
});

serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, (info) => {
  process.stdout.write(
    `demo merchant ${env.MERCHANT_RELEASE} on ${env.MERCHANT_NETWORK}: ${env.MERCHANT_PUBLIC_ORIGIN}${ordersPath} (listening on ${env.HOST}:${String(info.port)})\n`,
  );
});
