import { serve } from "@hono/node-server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import algosdk from "algosdk";
import { z } from "zod";
import { createTestnetTargetApp, testnetQuotePath } from "./app";

const envSchema = z.object({
  SELO_TESTNET_TARGET_ADDRESS: z.string().refine((value) => algosdk.isValidAddress(value), {
    message: "must be a valid Algorand address",
  }),
  SELO_VERIFICATION_LINE: z
    .string()
    .regex(/^selo-verification=[A-Za-z0-9_-]+$/)
    .optional(),
  FACILITATOR_URL: z.url().default("https://facilitator.goplausible.xyz"),
  PORT: z.coerce.number().int().positive().default(8789),
  HOST: z.string().min(1).default("127.0.0.1"),
});

const env = envSchema.parse(process.env);
const app = createTestnetTargetApp({
  facilitator: new HTTPFacilitatorClient({ url: env.FACILITATOR_URL }),
  payTo: env.SELO_TESTNET_TARGET_ADDRESS,
  verificationLine: env.SELO_VERIFICATION_LINE ?? null,
});

serve({ fetch: app.fetch, port: env.PORT, hostname: env.HOST }, (info) => {
  process.stdout.write(
    `Selo Testnet demo target on http://${env.HOST}:${String(info.port)}${testnetQuotePath} (Algorand Testnet only)\n`,
  );
});
