import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExpectedContract } from "@selo/core";
import { eq, sql } from "drizzle-orm";
import { afterEach, beforeEach, vi } from "vitest";
import type { DownstreamPaymentRow, ReleaseJobRow, ScenarioRow } from "../../src/db/client";
import {
  downstreamPayments,
  evidence,
  preflights,
  releaseJobs,
  scenarios,
  targetAuthorizations,
} from "../../src/db/schema";
import { newId } from "../../src/ids";
import type { RunnerDeps } from "../../src/orchestrator/deps";
import { createJobRunner } from "../../src/orchestrator/run-job";
import { db, resetDatabaseBetweenTests } from "../support";
import { FakeWalletBalance } from "./fake-wallet";
import { ListingCatalog } from "./listing-catalog";
import { createMnemonicScheme, operatorMnemonic } from "./mnemonic-scheme";
import {
  StockSeller,
  targetNetwork,
  targetOrigin,
  targetPath,
  targetPayTo,
  targetUrl,
} from "./stock-seller";

export const seller = new StockSeller();
export const catalog = new ListingCatalog(seller);
export const wallet = new FakeWalletBalance();
export const scheme = createMnemonicScheme(operatorMnemonic);
export const reportsDir = mkdtempSync(join(tmpdir(), "selo-reports-"));
export const reportTokenSecret = "test-report-token-secret-with-32-plus-chars";
export const publicBaseUrl = "https://selo.example/api/";
export const jobMaxSpendMicros = 500_000;

export function runnerDeps(overrides: Partial<RunnerDeps> = {}): RunnerDeps {
  return {
    db,
    network: targetNetwork,
    scheme,
    targetFetch: seller.fetchFor,
    catalog,
    walletBalance: wallet,
    absoluteCapMicros: 5_000_000,
    wallClockMs: 10_000,
    reports: { dir: reportsDir, tokenSecret: reportTokenSecret, publicBaseUrl },
    ...overrides,
  };
}

export const runnerWith = (overrides: Partial<RunnerDeps> = {}) =>
  createJobRunner(runnerDeps(overrides));

export function useOrchestratorHarness(): void {
  resetDatabaseBetweenTests();
  beforeEach(() => {
    seller.reset();
    catalog.reset();
    wallet.reset();
    scheme.failWith = null;
    scheme.hang = false;
    scheme.opaque = false;
    scheme.signedTxIds.length = 0;
  });
}

export interface JobSeed {
  readonly status?: "INBOUND_SETTLED" | "READY";
  readonly expected?: ExpectedContract;
  readonly authorizationStatus?: "VERIFIED" | "REVOKED";
  readonly authorizationExpiresAt?: Date;
}

export async function seedRunnableJob(seed: JobSeed = {}): Promise<string> {
  const authorizationId = newId("auth");
  await db.insert(targetAuthorizations).values({
    id: authorizationId,
    origin: targetOrigin,
    routePath: targetPath,
    httpMethod: "GET",
    authorizationType: "manual_owner_consent",
    consentNote: "owner agreed in writing",
    project: "quote-api",
    contact: "owner@example.com",
    status: seed.authorizationStatus ?? "VERIFIED",
    verifiedAt: new Date(),
    expiresAt: seed.authorizationExpiresAt ?? new Date(Date.now() + 3_600_000),
  });
  const preflightId = newId("pfl");
  await db.insert(preflights).values({
    id: preflightId,
    authorizationId,
    targetUrl,
    httpMethod: "GET",
    paymentNetwork: targetNetwork.caip2,
    paymentAsset: targetNetwork.usdcAssetId,
    paymentAmountMicros: 10_000,
    payTo: targetPayTo,
    paymentRequirementsHash: "a".repeat(64),
    eligible: true,
    expiresAt: new Date(Date.now() + 900_000),
  });
  const jobId = newId("job");
  const settled = (seed.status ?? "INBOUND_SETTLED") === "INBOUND_SETTLED";
  await db.insert(releaseJobs).values({
    id: jobId,
    preflightId,
    profile: "quick",
    status: seed.status ?? "INBOUND_SETTLED",
    idempotencyKey: jobId,
    maxSpendMicros: jobMaxSpendMicros,
    expectedJson: seed.expected ?? null,
    gitSha: "testsha",
    ...(settled
      ? {
          incomingTxId: `INBOUND${jobId}`,
          incomingAmountMicros: 1_000_000,
          incomingSettledAt: sql`clock_timestamp()`,
        }
      : {}),
  });
  return jobId;
}

export async function jobRow(jobId: string): Promise<ReleaseJobRow> {
  const [row] = await db.select().from(releaseJobs).where(eq(releaseJobs.id, jobId));
  if (row === undefined) {
    throw new Error(`job ${jobId} is missing`);
  }
  return row;
}

export async function scenarioRows(jobId: string): Promise<readonly ScenarioRow[]> {
  return db.select().from(scenarios).where(eq(scenarios.jobId, jobId));
}

export async function paymentRows(jobId: string): Promise<readonly DownstreamPaymentRow[]> {
  return db.select().from(downstreamPayments).where(eq(downstreamPayments.jobId, jobId));
}

export async function evidenceRows(jobId: string) {
  return db.select().from(evidence).where(eq(evidence.jobId, jobId));
}

export interface Captured {
  readonly stdout: string[];
  readonly stderr: string[];
}

export function captureOutput(): Captured {
  const captured: Captured = { stdout: [], stderr: [] };
  beforeEach(() => {
    captured.stdout.length = 0;
    captured.stderr.length = 0;
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: string | Uint8Array) => {
      captured.stdout.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk: string | Uint8Array) => {
      captured.stderr.push(String(chunk));
      return true;
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  return captured;
}
