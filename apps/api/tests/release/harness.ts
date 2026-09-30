import type { ReleaseTestResponse } from "@selo/core";
import { decodePaymentRequiredHeader, encodePaymentSignatureHeader } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import algosdk from "algosdk";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, vi } from "vitest";
import { createApp } from "../../src/app";
import type { ReleaseJobRow } from "../../src/db/client";
import { preflights, releaseJobs, targetAuthorizations } from "../../src/db/schema";
import { newId } from "../../src/ids";
import { createInboundGate } from "../../src/payments/inbound";
import { seloNetworks } from "../../src/payments/networks";
import type { ReleaseRunner } from "../../src/release/deps";
import { FakeFacilitator } from "../support/fake-facilitator";
import { authorizationTtlHours, db, resetDatabaseBetweenTests, verifier } from "../support";

export const mainnet = seloNetworks["algorand-mainnet"];
export const seloPayTo = algosdk.encodeAddress(new Uint8Array(32).fill(9));
export const resourceUrl = "https://selo.example/v1/release-test";
export const priceMicros = 1_000_000;
export const jobMaxSpendMicros = 500_000;
export const facilitator = new FakeFacilitator();

export interface RunRecord {
  readonly jobId: string;
  readonly startedAt: number;
  readonly job: ReleaseJobRow;
}

export async function jobRow(jobId: string): Promise<ReleaseJobRow | undefined> {
  const [row] = await db.select().from(releaseJobs).where(eq(releaseJobs.id, jobId));
  return row;
}

export async function allJobs(): Promise<readonly ReleaseJobRow[]> {
  return db.select().from(releaseJobs);
}

function reportFor(job: ReleaseJobRow): ReleaseTestResponse {
  return {
    jobId: job.id,
    verdict: "PASS",
    target: "https://api.example.com/v1/quote",
    checks: [],
    warnings: [],
    inconclusiveReason: null,
    money: {
      seloInboundTxId: job.incomingTxId ?? "",
      downstreamSpendUsdc: "0.01",
      downstreamTxIds: [],
    },
    reportUrl: `https://selo.example/v1/reports/${job.id}`,
  };
}

export class RecordingRunner implements ReleaseRunner {
  readonly runs: RunRecord[] = [];
  failure: Error | null = null;

  async run(jobId: string): Promise<ReleaseTestResponse> {
    const startedAt = facilitator.tick();
    const job = await jobRow(jobId);
    if (job === undefined) {
      throw new Error(`runner started for missing job ${jobId}`);
    }
    this.runs.push({ jobId, startedAt, job });
    if (this.failure !== null) {
      throw this.failure;
    }
    await db
      .update(releaseJobs)
      .set({ status: "REPORT_WRITTEN", verdict: "PASS" })
      .where(eq(releaseJobs.id, jobId));
    return reportFor(job);
  }

  async result(jobId: string): Promise<ReleaseTestResponse | null> {
    const job = await jobRow(jobId);
    return job?.status === "REPORT_WRITTEN" ? reportFor(job) : null;
  }
}

export const runner = new RecordingRunner();

const gate = createInboundGate({
  facilitator,
  network: mainnet.caip2,
  usdcAssetId: mainnet.usdcAssetId,
  payTo: seloPayTo,
  priceMicros,
  resourceUrl,
  facilitatorUrl: "https://facilitator.test",
});

const app = gate.then((ready) =>
  createApp(db, {
    authorizations: { ttlHours: authorizationTtlHours, verificationFetch: verifier.fetchFor },
    release: { gate: ready, runner, jobMaxSpendMicros, gitSha: "testsha" },
  }),
);

export function useReleaseHarness(): void {
  resetDatabaseBetweenTests();
  beforeEach(() => {
    facilitator.reset();
    runner.runs.length = 0;
    runner.failure = null;
  });
}

export async function releaseTest(
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): Promise<Response> {
  return (await app).request("/v1/release-test", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

export function decodeChallenge(response: Response): PaymentRequired {
  const header = response.headers.get("PAYMENT-REQUIRED");
  if (header === null) {
    throw new Error(`expected a PAYMENT-REQUIRED header on a ${String(response.status)}`);
  }
  return decodePaymentRequiredHeader(header);
}

export function paymentHeaderFor(required: PaymentRequired, variant = "a"): string {
  const [accepted] = required.accepts;
  if (accepted === undefined) {
    throw new Error("the 402 offered no payment requirement");
  }
  const encode = (text: string) => Buffer.from(text).toString("base64");
  return encodePaymentSignatureHeader({
    x402Version: 2,
    resource: required.resource,
    accepted,
    payload: {
      paymentGroup: [encode(`fee-payer-txn-${variant}`), encode(`usdc-transfer-${variant}`)],
      paymentIndex: 1,
    },
  });
}

export async function paidHeaders(body: unknown, variant = "a"): Promise<Record<string, string>> {
  const unpaid = await releaseTest(body);
  return { "PAYMENT-SIGNATURE": paymentHeaderFor(decodeChallenge(unpaid), variant) };
}

interface PreflightSeed {
  readonly eligible?: boolean;
  readonly expiresInMs?: number;
  readonly priceMicros?: number;
  readonly authorizationStatus?: "VERIFIED" | "PENDING" | "REVOKED";
  readonly authorizationExpiresInMs?: number;
}

export async function seedPreflight(seed: PreflightSeed = {}): Promise<string> {
  const authorizationId = newId("auth");
  await db.insert(targetAuthorizations).values({
    id: authorizationId,
    origin: "https://api.example.com",
    routePath: "/v1/quote",
    httpMethod: "GET",
    authorizationType: "manual_owner_consent",
    consentNote: "owner agreed in writing",
    project: "release",
    contact: "owner@example.com",
    status: seed.authorizationStatus ?? "VERIFIED",
    expiresAt: new Date(Date.now() + (seed.authorizationExpiresInMs ?? 3_600_000)),
  });
  const preflightId = newId("pfl");
  const eligible = seed.eligible ?? true;
  await db.insert(preflights).values({
    id: preflightId,
    authorizationId,
    targetUrl: "https://api.example.com/v1/quote",
    httpMethod: "GET",
    paymentNetwork: seloNetworks["algorand-testnet"].caip2,
    paymentAsset: seloNetworks["algorand-testnet"].usdcAssetId,
    paymentAmountMicros: seed.priceMicros ?? 10_000,
    payTo: "PAYTOADDRESS",
    paymentRequirementsHash: "a".repeat(64),
    eligible,
    rejectionReason: eligible ? null : "NO_PAYMENT_CHALLENGE",
    expiresAt: new Date(Date.now() + (seed.expiresInMs ?? 900_000)),
  });
  return preflightId;
}

export function captureAlerts(): string[] {
  const alerts: string[] = [];
  beforeEach(() => {
    alerts.length = 0;
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
      alerts.push(String(chunk));
      return true;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  return alerts;
}

export async function paidRequest(expected?: Readonly<Record<string, unknown>>) {
  const body = {
    preflightId: await seedPreflight(),
    profile: "quick",
    ...(expected === undefined ? {} : { expected }),
  };
  const headers = await paidHeaders(body);
  return { body, headers, response: await releaseTest(body, headers) };
}
