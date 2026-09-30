import type { HttpMethod } from "@selo/core";
import { encodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import algosdk from "algosdk";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { beforeEach } from "vitest";
import { createApp } from "../../src/app";
import type { CatalogClient, CatalogLookup } from "../../src/catalog/client";
import type { PreflightRow } from "../../src/db/client";
import { preflights, targetAuthorizations } from "../../src/db/schema";
import { newId } from "../../src/ids";
import { SafeFetchError } from "../../src/net/safe-fetch";
import { seloNetworks } from "../../src/payments/networks";
import type { FetchLike } from "../../src/payments/transport";
import type { PreflightDeps } from "../../src/preflight/deps";
import { authorizationTtlHours, db, resetDatabaseBetweenTests, verifier } from "../support";

export const mainnet = seloNetworks["algorand-mainnet"];
export const testnet = seloNetworks["algorand-testnet"];
export const origin = "https://api.example.com";
export const targetUrl = `${origin}/v1/quote`;
export const targetPayTo = algosdk.generateAccount().addr.toString();
export const jobMaxSpendMicros = 500_000;
export const seloPriceMicros = 1_000_000;
export const ttlMinutes = 15;

export const accept = (overrides: Partial<PaymentRequirements> = {}): PaymentRequirements => ({
  scheme: "exact",
  network: mainnet.caip2,
  asset: mainnet.usdcAssetId,
  amount: "10000",
  payTo: targetPayTo,
  maxTimeoutSeconds: 60,
  extra: { name: "USDC", decimals: 6, tag: "x402-global-challenge", feePayer: "FEEPAYER" },
  ...overrides,
});

export interface TargetRequest {
  readonly method: string;
  readonly url: string;
  readonly idempotencyKey: string | null;
  readonly paymentSignature: string | null;
  readonly body: string;
}

export class FakeTarget {
  readonly requests: TargetRequest[] = [];
  readonly origins: string[] = [];
  accepts: PaymentRequirements[] = [accept()];
  status = 402;
  failure: SafeFetchError | null = null;
  extraChallengeKeys: Record<string, unknown> = {};
  readonly app = new Hono();

  constructor() {
    this.app.on(["GET", "POST"], "/*", async (c) => {
      this.requests.push({
        method: c.req.method,
        url: c.req.url,
        idempotencyKey: c.req.header("Idempotency-Key") ?? null,
        paymentSignature: c.req.header("PAYMENT-SIGNATURE") ?? null,
        body: await c.req.text(),
      });
      const challenge =
        this.status === 402
          ? {
              "PAYMENT-REQUIRED": encodePaymentRequiredHeader({
                ...this.challenge(c.req.url),
                ...this.extraChallengeKeys,
              }),
            }
          : {};
      return new Response("{}", {
        status: this.status,
        headers: { ...challenge, "content-type": "application/json" },
      });
    });
  }

  challenge(url: string): PaymentRequired {
    return {
      x402Version: 2,
      error: "payment required",
      resource: { url, description: "quote", mimeType: "application/json" },
      accepts: this.accepts,
      extensions: { bazaar: { info: { input: { type: "http", method: "GET" } } } },
    };
  }

  reset(): void {
    this.requests.length = 0;
    this.origins.length = 0;
    this.accepts = [accept()];
    this.status = 402;
    this.failure = null;
    this.extraChallengeKeys = {};
  }

  readonly fetchFor = (allowedOrigin: string): FetchLike => {
    this.origins.push(allowedOrigin);
    return (input, init) => {
      if (this.failure !== null) {
        return Promise.reject(this.failure);
      }
      return Promise.resolve(this.app.request(input, init));
    };
  };
}

export class FakeCatalog implements CatalogClient {
  readonly lookups: { readonly resourceUrl: string; readonly method: HttpMethod }[] = [];
  answer: CatalogLookup = { kind: "not_found" };
  listedUrl: string | null = null;

  find(resourceUrl: string, method: HttpMethod): Promise<CatalogLookup> {
    this.lookups.push({ resourceUrl, method });
    const listed = this.listedUrl === null || this.listedUrl === resourceUrl;
    return Promise.resolve(listed ? this.answer : { kind: "not_found" });
  }

  reset(): void {
    this.lookups.length = 0;
    this.answer = { kind: "not_found" };
    this.listedUrl = null;
  }
}

export const target = new FakeTarget();
export const catalog = new FakeCatalog();

export const preflightDeps = (probeFetch: PreflightDeps["probeFetch"]): PreflightDeps => ({
  probeFetch,
  catalog,
  network: mainnet,
  jobMaxSpendMicros,
  seloPriceMicros,
  ttlMinutes,
});

export const appWith = (deps: PreflightDeps) =>
  createApp(db, {
    authorizations: { ttlHours: authorizationTtlHours, verificationFetch: verifier.fetchFor },
    preflight: deps,
  });

const app = appWith(preflightDeps(target.fetchFor));

export function usePreflightHarness(): void {
  resetDatabaseBetweenTests();
  beforeEach(() => {
    target.reset();
    catalog.reset();
  });
}

export interface AuthorizationSeed {
  readonly routePath?: string;
  readonly method?: HttpMethod;
  readonly status?: "PENDING" | "VERIFIED" | "REVOKED";
  readonly expiresAt?: Date;
}

export async function seedAuthorization(seed: AuthorizationSeed = {}): Promise<string> {
  const id = newId("auth");
  await db.insert(targetAuthorizations).values({
    id,
    origin,
    routePath: seed.routePath ?? "/v1/quote",
    httpMethod: seed.method ?? "GET",
    authorizationType: "manual_owner_consent",
    consentNote: "test consent",
    project: "quote",
    contact: "owner@example.com",
    status: seed.status ?? "VERIFIED",
    verifiedAt: new Date(),
    expiresAt: seed.expiresAt ?? new Date(Date.now() + 3_600_000),
  });
  return id;
}

export interface Reply {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

export async function preflight(
  body: unknown,
  via: ReturnType<typeof appWith> = app,
): Promise<Reply> {
  const response = await via.request("/v1/preflight", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const parsed: unknown = await response.json();
  return { status: response.status, body: parsed as Record<string, unknown> };
}

export async function getPreflight(id: string): Promise<Reply> {
  const response = await app.request(`/v1/preflight/${id}`);
  const parsed: unknown = await response.json();
  return { status: response.status, body: parsed as Record<string, unknown> };
}

export async function preflightRows(): Promise<readonly PreflightRow[]> {
  return db.select().from(preflights);
}

export async function preflightRow(id: string): Promise<PreflightRow | undefined> {
  const [row] = await db.select().from(preflights).where(eq(preflights.id, id));
  return row;
}
