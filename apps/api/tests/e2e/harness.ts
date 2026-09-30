import type { ReleaseTestResponse } from "@selo/core";
import type { PaymentPayload, PaymentRequirements, SettleResponse } from "@x402/core/types";
import algosdk from "algosdk";
import { beforeEach } from "vitest";
import { createApp } from "../../src/app";
import { grantConsent } from "../../src/authorizations/consent";
import { createInboundGate } from "../../src/payments/inbound";
import { createJobRunner } from "../../src/orchestrator/run-job";
import { FakeFacilitator } from "../support/fake-facilitator";
import { authorizationTtlHours, db, verifier } from "../support";
import { decodeChallenge, paymentHeaderFor } from "../release/harness";
import {
  catalog,
  jobMaxSpendMicros,
  runnerDeps,
  seller,
  useOrchestratorHarness,
} from "../orchestrator/harness";
import { targetNetwork, targetUrl } from "../orchestrator/stock-seller";

export const trace: string[] = [];

class TracingFacilitator extends FakeFacilitator {
  beforeSettle: () => Promise<void> = () => Promise.resolve();

  override async settle(
    payload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    await this.beforeSettle();
    const settled = await super.settle(payload, requirements);
    trace.push("selo:settled");
    return settled;
  }
}

export const seloFacilitator = new TracingFacilitator();

const gate = createInboundGate({
  facilitator: seloFacilitator,
  facilitatorUrl: "https://facilitator.test",
  network: targetNetwork.caip2,
  usdcAssetId: targetNetwork.usdcAssetId,
  payTo: algosdk.encodeAddress(new Uint8Array(32).fill(7)),
  priceMicros: 1_000_000,
  resourceUrl: "https://selo.example/v1/release-test",
});

export async function e2eApp(wallClockMs = 10_000) {
  return createApp(db, {
    authorizations: { ttlHours: authorizationTtlHours, verificationFetch: verifier.fetchFor },
    preflight: {
      probeFetch: (allowedOrigin) => seller.fetchFor({ allowedOrigin, timeoutMs: 10_000 }),
      catalog,
      network: targetNetwork,
      jobMaxSpendMicros,
      seloPriceMicros: 1_000_000,
      ttlMinutes: 15,
    },
    release: {
      gate: await gate,
      runner: createJobRunner(runnerDeps({ wallClockMs })),
      jobMaxSpendMicros,
      gitSha: "e2esha",
    },
  });
}

export type E2eApp = Awaited<ReturnType<typeof e2eApp>>;

export function useE2eHarness(): void {
  useOrchestratorHarness();
  beforeEach(() => {
    trace.length = 0;
    seloFacilitator.reset();
    seloFacilitator.beforeSettle = () => Promise.resolve();
    seller.onPaid = () => {
      trace.push("target:paid");
    };
  });
}

async function send(
  app: E2eApp,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

export interface Prepared {
  readonly authorizationId: string;
  readonly preflightId: string;
  readonly body: Readonly<Record<string, unknown>>;
  readonly headers: Readonly<Record<string, string>>;
}

export async function prepareRelease(
  app: E2eApp,
  expected?: Readonly<Record<string, unknown>>,
): Promise<Prepared> {
  const consent = await grantConsent(
    db,
    {
      targetUrl,
      method: "GET",
      project: "quote-api",
      contact: "owner@example.com",
      note: "owner consented in writing",
    },
    authorizationTtlHours,
  );
  if (!consent.ok) {
    throw new Error(consent.message);
  }
  const { authorizationId } = consent.authorization;
  const preflight = await send(app, "/v1/preflight", { authorizationId, targetUrl, method: "GET" });
  const preflightBody = (await preflight.json()) as { preflightId: string; eligible: boolean };
  if (preflight.status !== 201 || !preflightBody.eligible) {
    throw new Error(`preflight was not eligible: ${JSON.stringify(preflightBody)}`);
  }
  const body = {
    preflightId: preflightBody.preflightId,
    profile: "quick",
    ...(expected === undefined ? {} : { expected }),
  };
  const unpaid = await send(app, "/v1/release-test", body);
  if (unpaid.status !== 402) {
    throw new Error(`expected 402, received ${String(unpaid.status)}`);
  }
  const headers = { "PAYMENT-SIGNATURE": paymentHeaderFor(decodeChallenge(unpaid)) };
  return { authorizationId, preflightId: preflightBody.preflightId, body, headers };
}

export interface Paid {
  readonly status: number;
  readonly report: ReleaseTestResponse;
}

export async function payRelease(app: E2eApp, prepared: Prepared): Promise<Paid> {
  const response = await send(app, "/v1/release-test", prepared.body, { ...prepared.headers });
  const report = (await response.json()) as ReleaseTestResponse;
  return { status: response.status, report };
}
