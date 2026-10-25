import { describe, expect, it } from "vitest";
import { decideGate, parseReport } from "../src/gate";
import { conclude } from "../src/conclude";
import { failingReport, passingChecks, report } from "./fixtures";

describe("decideGate", () => {
  it("allows only a fully evidenced PASS", () => {
    expect(decideGate(report("PASS"))).toMatchObject({ gate: "ALLOW", exitCode: 0 });
    expect(decideGate(failingReport())).toMatchObject({ gate: "BLOCK", exitCode: 1 });
  });

  it("blocks with exit 2 when a check appears twice", () => {
    const [first] = passingChecks();
    const checks = first === undefined ? [] : [...passingChecks(), first];
    expect(decideGate(report("PASS", checks))).toMatchObject({ gate: "BLOCK", exitCode: 2 });
  });

  it("blocks with exit 2 when a FAIL carries no evidence", () => {
    const checks = passingChecks().map((check) =>
      check.id === "handshake" ? { ...check, status: "FAIL" as const, evidence: [] } : check,
    );
    expect(decideGate(report("FAIL", checks))).toMatchObject({ gate: "BLOCK", exitCode: 2 });
  });

  it("refuses an answer that is not a report", () => {
    expect(parseReport({ verdict: "PASS" }).ok).toBe(false);
    expect(parseReport(report("PASS")).ok).toBe(true);
  });
});

describe("conclude", () => {
  const record = (status: number, response: unknown) => ({
    kind: "completed" as const,
    record: {
      url: "https://selo.test/v1/release-test",
      idempotencyKey: "selo-cli-key-1",
      network: "algorand-testnet" as const,
      payer: "PAYER",
      payTo: "PAYTO",
      price: "1.00",
      tag: null,
      unpaidRequestedAt: "t0",
      paidRequestedAt: "t1",
      expectedInboundTxId: "EXPECTEDTX",
      respondedAt: "t2",
      status,
      inboundTxId: null,
      settlementError: null,
      response,
    },
  });

  it("holds every answer that may have settled as unresolved", () => {
    for (const [status, error] of [
      [502, "INBOUND_SETTLEMENT_UNRESOLVED"],
      [500, "INBOUND_RECORD_FAILED"],
      [503, "UNAVAILABLE"],
      [409, "JOB_IN_PROGRESS"],
    ] as const) {
      const conclusion = conclude(record(status, { error, message: "m" }), false);
      expect(conclusion, error).toMatchObject({ exitCode: 2, phase: "unresolved", gate: "BLOCK" });
      expect(conclusion.expectedInboundTxId).toBe("EXPECTEDTX");
    }
  });

  it("treats definite refusals as uncharged, except while resuming", () => {
    for (const status of [400, 402, 403, 404, 422]) {
      const body = { error: "X", message: "m" };
      expect(conclude(record(status, body), false)).toMatchObject({
        exitCode: 3,
        phase: "rejected",
      });
      expect(conclude(record(status, body), true)).toMatchObject({ phase: "unresolved" });
    }
  });

  it("maps an outcome lost in transit to unresolved and a policy refusal to exit 3", () => {
    expect(conclude({ kind: "unknown", message: "lost", record: null }, false)).toMatchObject({
      exitCode: 2,
      phase: "unresolved",
    });
    expect(
      conclude({ kind: "refused", cause: "policy", message: "Mainnet not approved" }, false),
    ).toMatchObject({ exitCode: 3, phase: "rejected" });
    expect(
      conclude({ kind: "refused", cause: "unreachable", message: "down" }, false),
    ).toMatchObject({
      exitCode: 2,
      phase: "rejected",
    });
  });
});
