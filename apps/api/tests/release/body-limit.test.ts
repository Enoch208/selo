import type { ApiError } from "@selo/core";
import { describe, expect, it } from "vitest";
import { facilitator, releaseTest, runner, useReleaseHarness } from "./harness";

useReleaseHarness();

describe("paid route body limit", () => {
  it("answers a body over 64 KiB with 413 before verifying any payment", async () => {
    const response = await releaseTest(
      { preflightId: "x".repeat(64 * 1024), profile: "quick" },
      { "PAYMENT-SIGNATURE": "irrelevant" },
    );
    expect(response.status).toBe(413);
    expect(((await response.json()) as ApiError).error).toBe("PAYLOAD_TOO_LARGE");
    expect(facilitator.calls).toHaveLength(0);
    expect(runner.runs).toHaveLength(0);
  });

  it("still validates a small body normally", async () => {
    const response = await releaseTest({ preflightId: "pfl_missing", profile: "quick" });
    expect(response.status).not.toBe(413);
  });
});
