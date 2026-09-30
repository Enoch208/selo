import { describe, expect, it } from "vitest";
import { retryOutcomeStatus } from "../src/verdict";

describe("retryOutcomeStatus", () => {
  it.each([
    ["PASS_SAFE_RETRY", "PASS"],
    ["PASS_REPLAY_REJECTED", "PASS"],
    ["WARN_NO_IDEMPOTENCY_CONTRACT", "WARN"],
    ["FAIL_DUPLICATE_SIDE_EFFECT", "FAIL"],
    ["INCONCLUSIVE", "INCONCLUSIVE"],
  ] as const)("maps %s to %s", (outcome, status) => {
    expect(retryOutcomeStatus(outcome)).toBe(status);
  });
});
