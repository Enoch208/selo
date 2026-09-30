import { describe, expect, it } from "vitest";
import { preflights, releaseJobs, scenarios, targetAuthorizations } from "../src/db/schema";
import { newId } from "../src/ids";
import { db, resetDatabaseBetweenTests } from "./support";

resetDatabaseBetweenTests();

async function seedAuthorization(): Promise<string> {
  const authorizationId = newId("auth");
  await db.insert(targetAuthorizations).values({
    id: authorizationId,
    origin: "https://api.example.com",
    routePath: "/v1/quote",
    httpMethod: "GET",
    authorizationType: "manual_owner_consent",
    consentNote: "owner agreed by email",
    project: "demo",
    contact: "owner@example.com",
    status: "VERIFIED",
    expiresAt: new Date(Date.now() + 3_600_000),
  });
  return authorizationId;
}

async function seedPreflight(): Promise<string> {
  const authorizationId = await seedAuthorization();
  const preflightId = newId("pfl");
  await db.insert(preflights).values({
    id: preflightId,
    authorizationId,
    targetUrl: "https://api.example.com/v1/quote",
    httpMethod: "GET",
    paymentNetwork: "algorand-testnet",
    paymentAsset: "10458941",
    paymentAmountMicros: 10_000,
    payTo: "PAYTOADDRESS",
    paymentRequirementsHash: "a".repeat(64),
    paymentRequirementsJson: { accepts: [] },
    eligible: true,
    expiresAt: new Date(Date.now() + 900_000),
  });
  return preflightId;
}

interface JobOverrides {
  readonly maxSpendMicros?: number;
  readonly settledSpendMicros?: number;
  readonly reservedSpendMicros?: number;
  readonly unresolvedSpendMicros?: number;
  readonly incomingTxId?: string;
}

async function insertJob(preflightId: string, overrides: JobOverrides = {}): Promise<string> {
  const id = newId("job");
  await db.insert(releaseJobs).values({
    id,
    preflightId,
    profile: "quick",
    idempotencyKey: id,
    maxSpendMicros: 500_000,
    ...overrides,
  });
  return id;
}

async function constraintOf(pending: Promise<unknown>): Promise<string | undefined> {
  const error: unknown = await pending.then(
    () => null,
    (failure: unknown) => failure,
  );
  if (!(error instanceof Error)) {
    return undefined;
  }
  const cause: unknown = error.cause;
  if (typeof cause === "object" && cause !== null && "constraint_name" in cause) {
    return String(cause.constraint_name);
  }
  return undefined;
}

describe("schema constraints", () => {
  it("I2: the budget invariant rejects settled + reserved + unresolved above max spend", async () => {
    const preflightId = await seedPreflight();
    const constraint = await constraintOf(
      insertJob(preflightId, {
        maxSpendMicros: 500_000,
        settledSpendMicros: 200_000,
        reservedSpendMicros: 200_000,
        unresolvedSpendMicros: 100_001,
      }),
    );
    expect(constraint).toBe("release_jobs_budget_invariant");
  });

  it("I2: the budget invariant accepts spend exactly at max spend", async () => {
    const preflightId = await seedPreflight();
    const id = await insertJob(preflightId, {
      maxSpendMicros: 500_000,
      settledSpendMicros: 200_000,
      reservedSpendMicros: 200_000,
      unresolvedSpendMicros: 100_000,
    });
    expect(id).toMatch(/^job_/);
  });

  it("I2: the absolute cap rejects a max spend above 5.00 USDC", async () => {
    const preflightId = await seedPreflight();
    const constraint = await constraintOf(insertJob(preflightId, { maxSpendMicros: 5_000_001 }));
    expect(constraint).toBe("release_jobs_absolute_cap");
  });

  it.each([
    [{ maxSpendMicros: 0 }],
    [{ settledSpendMicros: -1 }],
    [{ reservedSpendMicros: -1 }],
    [{ unresolvedSpendMicros: -1 }],
  ])("I2: non-negative counters and a positive max spend are enforced (%o)", async (overrides) => {
    const preflightId = await seedPreflight();
    const constraint = await constraintOf(insertJob(preflightId, overrides));
    expect(constraint).toBe("release_jobs_non_negative");
  });

  it("rejects an eligible preflight without its payment requirements", async () => {
    const authorizationId = await seedAuthorization();
    const constraint = await constraintOf(
      db.insert(preflights).values({
        id: newId("pfl"),
        authorizationId,
        targetUrl: "https://api.example.com/v1/quote",
        httpMethod: "GET",
        eligible: true,
        expiresAt: new Date(Date.now() + 900_000),
      }),
    );
    expect(constraint).toBe("preflights_eligible_complete");
  });

  it("I4: operation ids are unique per job", async () => {
    const preflightId = await seedPreflight();
    const jobId = await insertJob(preflightId);
    const scenario = {
      jobId,
      scenarioKey: "paid_delivery" as const,
      operationId: "op-1",
      blocking: true,
      expectedJson: {},
    };
    await db.insert(scenarios).values({ id: newId("scn"), ...scenario });
    const constraint = await constraintOf(
      db.insert(scenarios).values({ id: newId("scn"), ...scenario }),
    );
    expect(constraint).toBe("scenarios_job_operation_unique");
  });

  it("an incoming settlement tx id belongs to one job only", async () => {
    const preflightId = await seedPreflight();
    await insertJob(preflightId, { incomingTxId: "TX1" });
    const constraint = await constraintOf(insertJob(preflightId, { incomingTxId: "TX1" }));
    expect(constraint).toBe("release_jobs_incoming_tx_id_unique");
  });
});
