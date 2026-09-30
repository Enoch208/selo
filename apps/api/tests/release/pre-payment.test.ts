import type { ApiError } from "@selo/core";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { preflights, targetAuthorizations } from "../../src/db/schema";
import { db } from "../support";
import {
  allJobs,
  facilitator,
  jobMaxSpendMicros,
  releaseTest,
  runner,
  seedPreflight,
  useReleaseHarness,
} from "./harness";

useReleaseHarness();

async function expectRejected(response: Response, status: number, error: string): Promise<void> {
  const body = (await response.json()) as ApiError;
  expect({ status: response.status, error: body.error }).toEqual({ status, error });
  expect(response.headers.get("PAYMENT-REQUIRED")).toBeNull();
  expect(facilitator.calls).toHaveLength(0);
  expect(runner.runs).toHaveLength(0);
  expect(await allJobs()).toHaveLength(0);
}

describe("rejections before any payment interaction", () => {
  it("rejects an invalid body with 400 and no charge", async () => {
    const preflightId = await seedPreflight();
    await expectRejected(
      await releaseTest({ preflightId, profile: "deep" }),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("rejects a body that is not a JSON object with 400 and no charge", async () => {
    await expectRejected(await releaseTest("{"), 400, "VALIDATION_FAILED");
  });

  it("rejects an expected contract whose schema does not compile with 400 and no charge", async () => {
    const preflightId = await seedPreflight();
    await expectRejected(
      await releaseTest({
        preflightId,
        profile: "quick",
        expected: { jsonSchema: { type: "definitely-not-a-type" } },
      }),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("rejects a malformed Idempotency-Key with 400 and no charge", async () => {
    const preflightId = await seedPreflight();
    await expectRejected(
      await releaseTest({ preflightId, profile: "quick" }, { "Idempotency-Key": "short" }),
      400,
      "VALIDATION_FAILED",
    );
  });

  it("rejects an unknown preflight with 404 and no charge", async () => {
    await expectRejected(
      await releaseTest({ preflightId: "pfl_0000000000000000000000000Z", profile: "quick" }),
      404,
      "PREFLIGHT_NOT_FOUND",
    );
  });

  it("rejects an ineligible preflight with 422 and no charge", async () => {
    const preflightId = await seedPreflight({ eligible: false });
    await expectRejected(
      await releaseTest({ preflightId, profile: "quick" }),
      422,
      "PREFLIGHT_INELIGIBLE",
    );
  });

  it("rejects an expired preflight with 409 and no charge", async () => {
    const preflightId = await seedPreflight({ expiresInMs: -1 });
    await expectRejected(
      await releaseTest({ preflightId, profile: "quick" }),
      409,
      "PREFLIGHT_EXPIRED",
    );
  });

  it("rejects an authorization still VERIFIED in the database but past expires_at with 403 and no charge", async () => {
    const preflightId = await seedPreflight({ authorizationExpiresInMs: -1 });
    const [preflight] = await db.select().from(preflights).where(eq(preflights.id, preflightId));
    const authorizationId = preflight?.authorizationId ?? "";
    const statusOf = async () =>
      (
        await db
          .select()
          .from(targetAuthorizations)
          .where(eq(targetAuthorizations.id, authorizationId))
      )[0]?.status;
    expect(await statusOf()).toBe("VERIFIED");
    await expectRejected(
      await releaseTest({ preflightId, profile: "quick" }),
      403,
      "AUTHORIZATION_INVALID",
    );
    expect(await statusOf()).toBe("EXPIRED");
  });

  it("rejects a preflight whose authorization is not verified with 403 and no charge", async () => {
    const preflightId = await seedPreflight({ authorizationStatus: "REVOKED" });
    await expectRejected(
      await releaseTest({ preflightId, profile: "quick" }),
      403,
      "AUTHORIZATION_INVALID",
    );
  });

  it("rejects a target price above the job budget with 422 and no charge", async () => {
    const preflightId = await seedPreflight({ priceMicros: jobMaxSpendMicros + 1 });
    await expectRejected(
      await releaseTest({ preflightId, profile: "quick" }),
      422,
      "PRICE_OVER_BUDGET",
    );
  });
});
