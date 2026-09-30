import type { ApiError, ReleaseTestResponse } from "@selo/core";
import { describe, expect, it } from "vitest";
import {
  allJobs,
  facilitator,
  paidHeaders,
  releaseTest,
  runner,
  seedPreflight,
  useReleaseHarness,
} from "./harness";

useReleaseHarness();

type Reply = Partial<ReleaseTestResponse> & Partial<ApiError & { readonly jobId: string }>;

async function freshBody() {
  return { preflightId: await seedPreflight(), profile: "quick" };
}

describe("duplicate release requests", () => {
  it("A21: duplicate logical release request does not create duplicate jobs", async () => {
    const body = await freshBody();
    const headers = await paidHeaders(body);
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => releaseTest(body, headers)),
    );
    const replies = await Promise.all(
      responses.map(async (response) => ({
        status: response.status,
        body: (await response.json()) as Reply,
      })),
    );

    expect(facilitator.settleCalls()).toHaveLength(1);
    expect(runner.runs).toHaveLength(1);
    const jobs = await allJobs();
    expect(jobs).toHaveLength(1);
    const [job] = jobs;
    for (const reply of replies) {
      expect([200, 409]).toContain(reply.status);
      expect(reply.body.jobId).toBe(job?.id);
      if (reply.status === 409) {
        expect(reply.body.error).toBe("JOB_IN_PROGRESS");
      }
    }
    expect(replies.filter((reply) => reply.status === 200).length).toBeGreaterThanOrEqual(1);
  });

  it("A21: the same Idempotency-Key with two different payments settles once", async () => {
    const body = await freshBody();
    const key = { "Idempotency-Key": "release-2026-09-27-a" };
    const first = await releaseTest(body, { ...key, ...(await paidHeaders(body, "a")) });
    const second = await releaseTest(body, { ...key, ...(await paidHeaders(body, "b")) });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const [firstBody, secondBody] = (await Promise.all([first.json(), second.json()])) as [
      ReleaseTestResponse,
      ReleaseTestResponse,
    ];
    expect(secondBody).toEqual(firstBody);
    expect(facilitator.settleCalls()).toHaveLength(1);
    expect(runner.runs).toHaveLength(1);
    expect(await allJobs()).toHaveLength(1);
  });

  it("A21: a replayed payment whose settlement tx already belongs to a job never runs twice", async () => {
    facilitator.settleMode = "same-tx";
    const body = await freshBody();
    const first = await releaseTest(body, {
      "Idempotency-Key": "release-2026-09-27-first",
      ...(await paidHeaders(body)),
    });
    const second = await releaseTest(body, {
      "Idempotency-Key": "release-2026-09-27-second",
      ...(await paidHeaders(body)),
    });

    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as ReleaseTestResponse;
    const secondBody = (await second.json()) as Reply;
    expect(second.status).toBe(200);
    expect(secondBody.jobId).toBe(firstBody.jobId);
    expect(runner.runs).toHaveLength(1);
    expect(await allJobs()).toHaveLength(1);
  });

  it("a different payment for a new logical request creates its own job", async () => {
    const firstBody = await freshBody();
    const secondBody = await freshBody();
    await releaseTest(firstBody, await paidHeaders(firstBody, "a"));
    await releaseTest(secondBody, await paidHeaders(secondBody, "b"));
    expect(facilitator.settleCalls()).toHaveLength(2);
    expect(await allJobs()).toHaveLength(2);
  });
});
