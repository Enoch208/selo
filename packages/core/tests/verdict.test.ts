import type { CheckResult } from "../src/contract";
import { describe, expect, it } from "vitest";
import { reduceVerdict } from "../src/verdict";

function check(overrides: Partial<CheckResult> & Pick<CheckResult, "id">): CheckResult {
  return {
    status: "PASS",
    code: "OK",
    blocking: true,
    summary: "ok",
    evidence: ["proof"],
    ...overrides,
  };
}

const allPassing: readonly CheckResult[] = [
  check({ id: "handshake" }),
  check({ id: "paid_delivery" }),
  check({ id: "response_contract" }),
  check({ id: "discovery_contract" }),
  check({ id: "retry_safety" }),
];

describe("reduceVerdict", () => {
  it("throws on a duplicate check id", () => {
    expect(() =>
      reduceVerdict([check({ id: "handshake" }), check({ id: "handshake" })], null),
    ).toThrow(RangeError);
  });

  it("PASS when every check passes with evidence", () => {
    expect(reduceVerdict(allPassing, null)).toEqual({
      verdict: "PASS",
      inconclusiveReason: null,
      blockingFailures: [],
      warnings: [],
    });
  });

  it("A18: malformed response contract produces FAIL, not PASS", () => {
    const checks = allPassing.map((result) =>
      result.id === "response_contract"
        ? check({ id: "response_contract", status: "FAIL", evidence: ["schema mismatch"] })
        : result,
    );
    const outcome = reduceVerdict(checks, null);
    expect(outcome.verdict).toBe("FAIL");
    expect(outcome.inconclusiveReason).toBeNull();
    expect(outcome.blockingFailures).toEqual(["response_contract"]);
  });

  it("A19: infrastructure uncertainty produces INCONCLUSIVE, not FAIL or PASS", () => {
    const outcome = reduceVerdict(allPassing, "NETWORK_UNAVAILABLE");
    expect(outcome.verdict).toBe("INCONCLUSIVE");
    expect(outcome.inconclusiveReason).toBe("NETWORK_UNAVAILABLE");
    expect(outcome.blockingFailures).toEqual([]);
  });

  it("A20: a blocking PASS without evidence is never PASS", () => {
    const checks = allPassing.map((result) =>
      result.id === "handshake" ? check({ id: "handshake", status: "PASS", evidence: [] }) : result,
    );
    const outcome = reduceVerdict(checks, null);
    expect(outcome.verdict).toBe("INCONCLUSIVE");
    expect(outcome.inconclusiveReason).toBe("EVIDENCE_INCOMPLETE");
  });

  it("a proven FAIL beats a non-null abort reason", () => {
    const checks = allPassing.map((result) =>
      result.id === "handshake"
        ? check({ id: "handshake", status: "FAIL", evidence: ["refused"] })
        : result,
    );
    const outcome = reduceVerdict(checks, "TARGET_TIMEOUT");
    expect(outcome.verdict).toBe("FAIL");
    expect(outcome.inconclusiveReason).toBeNull();
  });

  it("a blocking FAIL without evidence is INCONCLUSIVE, not FAIL", () => {
    const checks = allPassing.map((result) =>
      result.id === "handshake" ? check({ id: "handshake", status: "FAIL", evidence: [] }) : result,
    );
    const outcome = reduceVerdict(checks, null);
    expect(outcome.verdict).toBe("INCONCLUSIVE");
    expect(outcome.inconclusiveReason).toBe("EVIDENCE_INCOMPLETE");
    expect(outcome.blockingFailures).toEqual([]);
  });

  it("a missing check id is INCONCLUSIVE", () => {
    const checks = allPassing.filter((result) => result.id !== "discovery_contract");
    const outcome = reduceVerdict(checks, null);
    expect(outcome.verdict).toBe("INCONCLUSIVE");
    expect(outcome.inconclusiveReason).toBe("EVIDENCE_INCOMPLETE");
  });

  it("a blocking INCONCLUSIVE check is INCONCLUSIVE", () => {
    const checks = allPassing.map((result) =>
      result.id === "retry_safety"
        ? check({ id: "retry_safety", status: "INCONCLUSIVE", evidence: [] })
        : result,
    );
    const outcome = reduceVerdict(checks, null);
    expect(outcome.verdict).toBe("INCONCLUSIVE");
    expect(outcome.inconclusiveReason).toBe("EVIDENCE_INCOMPLETE");
  });

  it("a blocking WARN with evidence yields PASS plus a warning", () => {
    const checks = allPassing.map((result) =>
      result.id === "paid_delivery"
        ? check({
            id: "paid_delivery",
            status: "WARN",
            summary: "slow response",
            evidence: ["latency"],
          })
        : result,
    );
    const outcome = reduceVerdict(checks, null);
    expect(outcome.verdict).toBe("PASS");
    expect(outcome.warnings).toEqual(["paid_delivery: slow response"]);
  });

  it("a non-blocking FAIL yields a warning only, not INCONCLUSIVE or FAIL", () => {
    const checks = allPassing.map((result) =>
      result.id === "discovery_contract"
        ? check({
            id: "discovery_contract",
            status: "FAIL",
            blocking: false,
            summary: "discovery missing",
            evidence: [],
          })
        : result,
    );
    const outcome = reduceVerdict(checks, null);
    expect(outcome.verdict).toBe("PASS");
    expect(outcome.warnings).toEqual(["discovery_contract: discovery missing"]);
  });

  it("a non-blocking INCONCLUSIVE check yields a warning only", () => {
    const checks = allPassing.map((result) =>
      result.id === "discovery_contract"
        ? check({
            id: "discovery_contract",
            status: "INCONCLUSIVE",
            blocking: false,
            summary: "could not reach",
            evidence: [],
          })
        : result,
    );
    const outcome = reduceVerdict(checks, null);
    expect(outcome.verdict).toBe("PASS");
    expect(outcome.warnings).toEqual(["discovery_contract: could not reach"]);
  });

  it("does not depend on input order", () => {
    const forward = allPassing.map((result) =>
      result.id === "paid_delivery"
        ? check({ id: "paid_delivery", status: "WARN", summary: "slow", evidence: ["e"] })
        : result,
    );
    const reversed = [...forward].reverse();
    expect(reduceVerdict(reversed, null)).toEqual(reduceVerdict(forward, null));
  });

  it("shuffle determinism over every permutation of a 5-check set", () => {
    const base = allPassing.map((result) =>
      result.id === "handshake"
        ? check({ id: "handshake", status: "FAIL", evidence: ["refused"] })
        : result.id === "paid_delivery"
          ? check({ id: "paid_delivery", status: "WARN", summary: "slow", evidence: ["e"] })
          : result,
    );
    const expected = reduceVerdict(base, null);

    function permutations<T>(items: readonly T[]): T[][] {
      if (items.length <= 1) {
        return [items.slice()];
      }
      const result: T[][] = [];
      for (let i = 0; i < items.length; i += 1) {
        const rest = [...items.slice(0, i), ...items.slice(i + 1)];
        for (const permutation of permutations(rest)) {
          result.push([items[i] as T, ...permutation]);
        }
      }
      return result;
    }

    for (const permutation of permutations(base)) {
      expect(reduceVerdict(permutation, null)).toEqual(expected);
    }
  });
});
