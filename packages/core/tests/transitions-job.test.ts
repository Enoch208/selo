import { describe, expect, it } from "vitest";
import { jobStatuses, type JobStatus } from "../src/contract";
import {
  assertJobTransition,
  canStartDownstream,
  isLegalJobTransition,
  isVerdictStatus,
  jobTransitions,
} from "../src/transitions";

const expectedJobEdges: readonly (readonly [JobStatus, JobStatus])[] = [
  ["READY", "INBOUND_SETTLED"],
  ["READY", "INCONCLUSIVE"],
  ["INBOUND_SETTLED", "QUEUED"],
  ["INBOUND_SETTLED", "INCONCLUSIVE"],
  ["QUEUED", "RUNNING_PREFLIGHT_RECHECK"],
  ["QUEUED", "INCONCLUSIVE"],
  ["RUNNING_PREFLIGHT_RECHECK", "RUNNING"],
  ["RUNNING_PREFLIGHT_RECHECK", "INCONCLUSIVE"],
  ["RUNNING", "ANALYZING"],
  ["RUNNING", "FAIL"],
  ["RUNNING", "INCONCLUSIVE"],
  ["ANALYZING", "PASS"],
  ["ANALYZING", "FAIL"],
  ["ANALYZING", "INCONCLUSIVE"],
  ["PASS", "REPORT_WRITTEN"],
  ["FAIL", "REPORT_WRITTEN"],
  ["INCONCLUSIVE", "REPORT_WRITTEN"],
];

describe("job transitions", () => {
  it("permits exactly the documented edges and nothing else", () => {
    const legal = jobStatuses.flatMap((from) =>
      jobStatuses.filter((to) => isLegalJobTransition(from, to)).map((to) => `${from}->${to}`),
    );
    const expected = expectedJobEdges.map(([from, to]) => `${from}->${to}`);
    expect(legal.sort()).toEqual(expected.sort());
  });

  it("asserts silently for legal edges and throws for illegal ones", () => {
    for (const [from, to] of expectedJobEdges) {
      expect(() => {
        assertJobTransition(from, to);
      }).not.toThrow();
    }
    expect(() => {
      assertJobTransition("READY", "RUNNING");
    }).toThrow("Illegal job transition READY -> RUNNING");
  });

  it("REPORT_WRITTEN has no outgoing edges", () => {
    for (const to of jobStatuses) {
      expect(isLegalJobTransition("REPORT_WRITTEN", to)).toBe(false);
    }
  });

  it("recognises verdict statuses and nothing else", () => {
    expect(isVerdictStatus("PASS")).toBe(true);
    expect(isVerdictStatus("FAIL")).toBe(true);
    expect(isVerdictStatus("INCONCLUSIVE")).toBe(true);
    expect(isVerdictStatus("RUNNING")).toBe(false);
    expect(isVerdictStatus("REPORT_WRITTEN")).toBe(false);
  });

  it("only RUNNING can start downstream work", () => {
    for (const status of jobStatuses) {
      expect(canStartDownstream(status)).toBe(status === "RUNNING");
    }
  });

  it("exposes the raw table", () => {
    expect(jobTransitions.length).toBe(expectedJobEdges.length);
  });
});
