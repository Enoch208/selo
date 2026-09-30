import { checkIds, reduceVerdict, type CheckResult } from "@selo/core";
import { describe, expect, it } from "vitest";
import { releaseTestOutputExample } from "../../src/release/discovery";

const example = releaseTestOutputExample;

function identifiers(): readonly string[] {
  return [
    example.jobId,
    example.money.seloInboundTxId,
    ...example.money.downstreamTxIds,
    ...example.checks.flatMap((check) => check.evidence),
  ];
}

describe("Bazaar output example", () => {
  it("lists all five checks in report order", () => {
    expect(example.checks.map((check) => check.id)).toEqual([...checkIds]);
  });

  it("carries a verdict the deterministic reducer derives from its own checks", () => {
    const reduced = reduceVerdict(example.checks, example.inconclusiveReason);
    expect(reduced.verdict).toBe(example.verdict);
    expect(reduced.inconclusiveReason).toBe(example.inconclusiveReason);
  });

  it("would not be a PASS if a check were missing or lacked evidence", () => {
    const [first, ...rest] = example.checks;
    expect(first).toBeDefined();
    expect(reduceVerdict(rest, null).verdict).toBe("INCONCLUSIVE");
    const stripped: CheckResult[] = example.checks.map((check) => ({ ...check, evidence: [] }));
    expect(reduceVerdict(stripped, null).verdict).toBe("INCONCLUSIVE");
  });

  it("uses the absolute API report URL shape", () => {
    expect(example.reportUrl).toMatch(/^https:\/\/[^/]+\/v1\/reports\/EXAMPLE[A-Z_]*$/);
    expect(example.reportUrl).not.toContain("/r/");
  });

  it("marks every id and transaction as illustrative", () => {
    for (const id of identifiers()) {
      expect(id).toContain("EXAMPLE");
    }
  });
});
