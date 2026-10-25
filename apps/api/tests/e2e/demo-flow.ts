import type {
  AuthorizationChallengeView,
  AuthorizationView,
  ExpectedContract,
  PreflightResponse,
  ReleaseTestResponse,
} from "@selo/core";
import order from "@selo/example-merchant/order.json" with { type: "json" };
import algosdk from "algosdk";
import { createApp } from "../../src/app";
import { createInboundGate } from "../../src/payments/inbound";
import { seloNetworks } from "../../src/payments/networks";
import { createJobRunner } from "../../src/orchestrator/run-job";
import { db } from "../support";
import { FakeFacilitator } from "../support/fake-facilitator";
import { jobMaxSpendMicros, runnerDeps } from "../orchestrator/harness";
import { decodeChallenge, paymentHeaderFor } from "../release/harness";
import { demoUrl, type DemoDeployment } from "./demo-deployment";

export const seloInbound = new FakeFacilitator();
const testnet = seloNetworks["algorand-testnet"];

export async function seloFor(deployment: DemoDeployment) {
  const gate = await createInboundGate({
    facilitator: seloInbound,
    facilitatorUrl: "https://facilitator.test",
    network: testnet.caip2,
    usdcAssetId: testnet.usdcAssetId,
    payTo: algosdk.encodeAddress(new Uint8Array(32).fill(9)),
    priceMicros: 1_000_000,
    resourceUrl: "https://selo.example/v1/release-test",
  });
  return createApp(db, {
    authorizations: { ttlHours: 24, verificationFetch: deployment.verificationFetch },
    preflight: {
      probeFetch: (allowedOrigin) => deployment.fetchFor({ allowedOrigin, timeoutMs: 10_000 }),
      catalog: deployment,
      network: testnet,
      jobMaxSpendMicros,
      seloPriceMicros: 1_000_000,
      ttlMinutes: 15,
    },
    release: {
      gate,
      runner: createJobRunner(
        runnerDeps({ targetFetch: deployment.fetchFor, catalog: deployment }),
      ),
      jobMaxSpendMicros,
      gitSha: "demosha",
    },
  });
}

type SeloApp = Awaited<ReturnType<typeof seloFor>>;

function post(
  app: SeloApp,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return Promise.resolve(
    app.request(path, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
  );
}

export async function authorizeByWellKnownFile(
  app: SeloApp,
  deployment: DemoDeployment,
): Promise<AuthorizationView> {
  const created = await post(app, "/v1/authorizations", {
    targetUrl: demoUrl,
    method: "POST",
    project: "selo-demo-merchant",
    contact: "owner@selo.example",
  });
  const challenge = (await created.json()) as AuthorizationChallengeView;
  deployment.serveVerification(challenge.expectedContent);
  const verified = await post(app, `/v1/authorizations/${challenge.authorizationId}/verify`, {});
  return (await verified.json()) as AuthorizationView;
}

export interface ReleaseRun {
  readonly preflight: PreflightResponse;
  readonly status: number;
  readonly report: ReleaseTestResponse;
}

export async function payForReleaseTest(
  app: SeloApp,
  authorizationId: string,
  expected: ExpectedContract,
  paymentVariant: string,
): Promise<ReleaseRun> {
  const answered = await post(app, "/v1/preflight", {
    authorizationId,
    targetUrl: demoUrl,
    method: "POST",
    requestBody: order,
  });
  const preflight = (await answered.json()) as PreflightResponse;
  if (!preflight.eligible) {
    throw new Error(`preflight was not eligible: ${JSON.stringify(preflight)}`);
  }
  const body = { preflightId: preflight.preflightId, profile: "quick", expected };
  const unpaid = await post(app, "/v1/release-test", body);
  const signature = paymentHeaderFor(decodeChallenge(unpaid), paymentVariant);
  const paid = await post(app, "/v1/release-test", body, { "PAYMENT-SIGNATURE": signature });
  return { preflight, status: paid.status, report: (await paid.json()) as ReleaseTestResponse };
}
