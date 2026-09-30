import { afterAll } from "vitest";
import { createDb, type Db } from "../../src/db/client";
import { preflights, releaseJobs, scenarios, targetAuthorizations } from "../../src/db/schema";
import { newId } from "../../src/ids";
import type { ReserveInput } from "../../src/ledger/reserve";
import { db } from "../support";

export const origin = "https://api.example.com";
export const network = "algorand-testnet";
export const asset = "10458941";
export const absoluteCapMicros = 5_000_000;
export const now = new Date("2026-09-27T12:00:00Z");

export interface SeededJob {
  readonly jobId: string;
  readonly scenarioIds: readonly string[];
}

interface JobSeed {
  readonly maxSpendMicros: number;
  readonly scenarios?: number;
  readonly status?: "RUNNING" | "QUEUED" | "INCONCLUSIVE";
}

async function seedPreflight(): Promise<string> {
  const authorizationId = newId("auth");
  await db.insert(targetAuthorizations).values({
    id: authorizationId,
    origin,
    routePath: "/v1/quote",
    httpMethod: "GET",
    authorizationType: "manual_owner_consent",
    consentNote: "owner agreed in writing",
    project: "ledger",
    contact: "owner@example.com",
    status: "VERIFIED",
    expiresAt: new Date(now.getTime() + 3_600_000),
  });
  const preflightId = newId("pfl");
  await db.insert(preflights).values({
    id: preflightId,
    authorizationId,
    targetUrl: `${origin}/v1/quote`,
    httpMethod: "GET",
    paymentNetwork: network,
    paymentAsset: asset,
    paymentAmountMicros: 10_000,
    payTo: "PAYTOADDRESS",
    paymentRequirementsHash: "a".repeat(64),
    eligible: true,
    expiresAt: new Date(now.getTime() + 900_000),
  });
  return preflightId;
}

export async function seedJob(seed: JobSeed): Promise<SeededJob> {
  const preflightId = await seedPreflight();
  const jobId = newId("job");
  await db.insert(releaseJobs).values({
    id: jobId,
    preflightId,
    profile: "quick",
    status: seed.status ?? "RUNNING",
    idempotencyKey: jobId,
    maxSpendMicros: seed.maxSpendMicros,
  });
  const scenarioIds = Array.from({ length: seed.scenarios ?? 1 }, () => newId("scn"));
  await db.insert(scenarios).values(
    scenarioIds.map((id, index) => ({
      id,
      jobId,
      scenarioKey: "paid_delivery" as const,
      operationId: `op-${String(index)}`,
      blocking: true,
      expectedJson: {},
    })),
  );
  return { jobId, scenarioIds };
}

export function reserveInput(
  job: SeededJob,
  amountMicros: number,
  overrides: Partial<ReserveInput> = {},
): ReserveInput {
  return {
    jobId: job.jobId,
    scenarioId: job.scenarioIds[0] ?? "",
    authorization: {
      status: "VERIFIED",
      origin,
      expiresAt: new Date(now.getTime() + 3_600_000),
    },
    payment: {
      origin,
      network,
      asset,
      amountMicros,
      payTo: "PAYTOADDRESS",
      requirementsHash: "b".repeat(64),
    },
    scenarioMaxSpendMicros: 1_000_000,
    absoluteCapMicros,
    allowedNetwork: network,
    allowedAsset: asset,
    now,
    ...overrides,
  };
}

export function separateConnections(count: number): readonly Db[] {
  const url = process.env.DATABASE_URL ?? "";
  const clients = Array.from({ length: count }, () => createDb(url));
  afterAll(async () => {
    await Promise.all(clients.map((client) => client.$client.end()));
  });
  return clients;
}
