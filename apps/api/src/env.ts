import { classifyHostname, parseMicros } from "@selo/core";
import algosdk from "algosdk";
import { z } from "zod";
import { InvalidMnemonic, operatingAddress } from "./payments/wallet";

const absoluteCapMicros = 5_000_000;

function usdc(fallback: string) {
  return z
    .string()
    .default(fallback)
    .transform((value, ctx) => {
      const micros = parseMicros(value);
      if (micros === null || micros <= 0) {
        ctx.issues.push({
          code: "custom",
          input: value,
          message: "Expected a positive decimal USDC amount with at most 6 decimals",
        });
        return z.NEVER;
      }
      return micros;
    });
}

function isPublicHttps(url: string): boolean {
  const parsed = new URL(url);
  return parsed.protocol === "https:" && classifyHostname(parsed.hostname) === "ok";
}

const databaseUrl = z.url();
const authorizationTtlHours = z.coerce.number().int().positive().default(24);

const envSchema = z
  .object({
    DATABASE_URL: databaseUrl,
    PORT: z.coerce.number().int().positive().default(8787),
    HOST: z.string().min(1).default("127.0.0.1"),
    PUBLIC_BASE_URL: z.url(),
    SELO_NETWORK: z.enum(["algorand-mainnet", "algorand-testnet"]).default("algorand-testnet"),
    SELO_TEST_PRICE_USDC: usdc("1.00"),
    SELO_JOB_MAX_SPEND_USDC: usdc("0.50"),
    SELO_ABSOLUTE_MAX_SPEND_USDC: usdc("5.00"),
    AUTHORIZATION_TTL_HOURS: authorizationTtlHours,
    PREFLIGHT_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    GIT_SHA: z.string().min(1).optional(),
    SELO_PAY_TO: z
      .string()
      .refine((value) => algosdk.isValidAddress(value), "Expected an Algorand address"),
    FACILITATOR_URL: z
      .url({ protocol: /^https$/, error: "FACILITATOR_URL must be an https URL" })
      .default("https://facilitator.goplausible.xyz"),
  })
  .refine((env) => env.SELO_NETWORK !== "algorand-mainnet" || isPublicHttps(env.PUBLIC_BASE_URL), {
    message: "PUBLIC_BASE_URL must be a public https URL on algorand-mainnet",
    path: ["PUBLIC_BASE_URL"],
  })
  .refine((env) => env.SELO_JOB_MAX_SPEND_USDC <= env.SELO_ABSOLUTE_MAX_SPEND_USDC, {
    message: "SELO_JOB_MAX_SPEND_USDC must not exceed SELO_ABSOLUTE_MAX_SPEND_USDC",
    path: ["SELO_JOB_MAX_SPEND_USDC"],
  })
  .refine((env) => env.SELO_ABSOLUTE_MAX_SPEND_USDC <= absoluteCapMicros, {
    message: "SELO_ABSOLUTE_MAX_SPEND_USDC must not exceed 5.00",
    path: ["SELO_ABSOLUTE_MAX_SPEND_USDC"],
  })
  .transform(
    ({ SELO_TEST_PRICE_USDC, SELO_JOB_MAX_SPEND_USDC, SELO_ABSOLUTE_MAX_SPEND_USDC, ...rest }) => ({
      ...rest,
      SELO_TEST_PRICE_MICROS: SELO_TEST_PRICE_USDC,
      SELO_JOB_MAX_SPEND_MICROS: SELO_JOB_MAX_SPEND_USDC,
      SELO_ABSOLUTE_MAX_SPEND_MICROS: SELO_ABSOLUTE_MAX_SPEND_USDC,
    }),
  );

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv): Env {
  return envSchema.parse(source);
}

const consentEnvSchema = z.object({
  DATABASE_URL: databaseUrl,
  AUTHORIZATION_TTL_HOURS: authorizationTtlHours,
});

export type ConsentEnv = z.infer<typeof consentEnvSchema>;

export function loadConsentEnv(source: NodeJS.ProcessEnv): ConsentEnv {
  return consentEnvSchema.parse(source);
}

export function payToWarning(payTo: string, operatingAddress: string): string | null {
  if (payTo === operatingAddress) {
    return null;
  }
  return `SELO_PAY_TO ${payTo} differs from the operating wallet ${operatingAddress}; inbound revenue will not refill the wallet that pays targets`;
}

const mnemonicWords = 25;

function operatingAddressOf(mnemonic: string): string | null {
  try {
    return operatingAddress(mnemonic);
  } catch (error: unknown) {
    if (error instanceof InvalidMnemonic) {
      return null;
    }
    throw error;
  }
}

const operatorEnvSchema = z
  .object({
    SELO_OPERATOR_MNEMONIC: z.string({ error: "SELO_OPERATOR_MNEMONIC is required" }),
    REPORT_TOKEN_SECRET: z.string().min(32),
    REPORTS_DIR: z.string().min(1).default("reports"),
    JOB_WALL_CLOCK_MS: z.coerce.number().int().positive().default(60_000),
  })
  .transform((env, ctx) => {
    const words = env.SELO_OPERATOR_MNEMONIC.trim().split(/\s+/);
    const address = words.length === mnemonicWords ? operatingAddressOf(words.join(" ")) : null;
    if (address === null || !algosdk.isValidAddress(address)) {
      ctx.issues.push({
        code: "custom",
        input: "[redacted]",
        path: ["SELO_OPERATOR_MNEMONIC"],
        message: "SELO_OPERATOR_MNEMONIC must be a 25-word Algorand mnemonic of a valid account",
      });
      return z.NEVER;
    }
    return { ...env, SELO_OPERATOR_MNEMONIC: words.join(" "), operatingAddress: address };
  });

export type OperatorEnv = z.infer<typeof operatorEnvSchema>;

export function loadOperatorEnv(source: NodeJS.ProcessEnv): OperatorEnv {
  return operatorEnvSchema.parse(source);
}
