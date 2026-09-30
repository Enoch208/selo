import { describe, expect, it } from "vitest";
import type { EvaluateRetrySafetyInput, RetryObservation } from "../../src/checks/retry-safety";
import { evaluateRetrySafety } from "../../src/checks/retry-safety";

const evidence = ["ev-3"];
const originalTxId = "ORIGINALTX123";

function evaluate(
  replay: RetryObservation,
  overrides: Partial<Pick<EvaluateRetrySafetyInput, "method" | "originalTxId">> = {},
) {
  return evaluateRetrySafety({
    method: "GET",
    originalTxId,
    replay,
    evidence,
    ...overrides,
  });
}

describe("evaluateRetrySafety", () => {
  it.each([402, 400, 409, 499])("response %i is PASS_REPLAY_REJECTED", (status) => {
    const { check, outcome } = evaluate({ kind: "response", status, txId: null });
    expect(outcome).toBe("PASS_REPLAY_REJECTED");
    expect(check.status).toBe("PASS");
    expect(check.code).toBe("PASS_REPLAY_REJECTED");
  });

  it.each([408, 429])("response %i is INCONCLUSIVE, not a replay rejection", (status) => {
    const { check, outcome } = evaluate({ kind: "response", status, txId: null });
    expect(outcome).toBe("INCONCLUSIVE");
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.summary).toContain(String(status));
  });

  it("response 2xx with the same txId is PASS_SAFE_RETRY", () => {
    const { check, outcome } = evaluate({ kind: "response", status: 200, txId: originalTxId });
    expect(outcome).toBe("PASS_SAFE_RETRY");
    expect(check.status).toBe("PASS");
  });

  it("response 2xx with a different non-null txId is FAIL_DUPLICATE_SIDE_EFFECT", () => {
    const { check, outcome } = evaluate({ kind: "response", status: 200, txId: "DIFFERENTTX" });
    expect(outcome).toBe("FAIL_DUPLICATE_SIDE_EFFECT");
    expect(check.status).toBe("FAIL");
  });

  it("response 2xx with a null txId on GET is WARN_NO_IDEMPOTENCY_CONTRACT", () => {
    const { check, outcome } = evaluate(
      { kind: "response", status: 200, txId: null },
      { method: "GET" },
    );
    expect(outcome).toBe("WARN_NO_IDEMPOTENCY_CONTRACT");
    expect(check.status).toBe("WARN");
    expect(check.summary).not.toMatch(/always idempotent|guarantees? idempotency/i);
  });

  it("response 2xx with a null txId on POST is FAIL_DUPLICATE_SIDE_EFFECT", () => {
    const { check, outcome } = evaluate(
      { kind: "response", status: 200, txId: null },
      { method: "POST" },
    );
    expect(outcome).toBe("FAIL_DUPLICATE_SIDE_EFFECT");
    expect(check.status).toBe("FAIL");
  });

  it.each([500, 503, 301, 304])("response %i is INCONCLUSIVE", (status) => {
    const { check, outcome } = evaluate({ kind: "response", status, txId: null });
    expect(outcome).toBe("INCONCLUSIVE");
    expect(check.status).toBe("INCONCLUSIVE");
  });

  it("a timeout is INCONCLUSIVE", () => {
    const { outcome } = evaluate({ kind: "timeout" });
    expect(outcome).toBe("INCONCLUSIVE");
  });

  it("a network_error is INCONCLUSIVE", () => {
    const { outcome } = evaluate({ kind: "network_error" });
    expect(outcome).toBe("INCONCLUSIVE");
  });

  it("not_run is INCONCLUSIVE", () => {
    const { outcome } = evaluate({ kind: "not_run" });
    expect(outcome).toBe("INCONCLUSIVE");
  });

  it("check.code always equals the outcome and evidence passes through unchanged", () => {
    const { check, outcome } = evaluate({ kind: "response", status: 200, txId: originalTxId });
    expect(check.code).toBe(outcome);
    expect(check.evidence).toBe(evidence);
    expect(check.id).toBe("retry_safety");
    expect(check.blocking).toBe(true);
  });
  it("POST replay returning 2xx without a new settlement but the byte-identical stored result is PASS_SAFE_RETRY", () => {
    const { check, outcome } = evaluate(
      { kind: "response", status: 200, txId: null, sameBody: true },
      { method: "POST" },
    );
    expect(outcome).toBe("PASS_SAFE_RETRY");
    expect(check.status).toBe("PASS");
    expect(check.summary).toMatch(/identical/);
  });

  it("POST replay returning 2xx without a settlement and a different body stays FAIL_DUPLICATE_SIDE_EFFECT", () => {
    const { outcome } = evaluate(
      { kind: "response", status: 200, txId: null, sameBody: false },
      { method: "POST" },
    );
    expect(outcome).toBe("FAIL_DUPLICATE_SIDE_EFFECT");
  });

  it("GET replay with a different body and no settlement stays WARN_NO_IDEMPOTENCY_CONTRACT", () => {
    const { outcome } = evaluate({ kind: "response", status: 200, txId: null, sameBody: false });
    expect(outcome).toBe("WARN_NO_IDEMPOTENCY_CONTRACT");
  });
});
