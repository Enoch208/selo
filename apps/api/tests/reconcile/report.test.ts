import algosdk from "algosdk";
import { describe, expect, it } from "vitest";
import { loadReconcileEnv } from "../../src/env";
import type { UnresolvedPayment } from "../../src/reconcile/candidates";
import {
  defaultReconcileLimit,
  maxReconcileLimit,
  reconcileLimit,
  reconcileSucceeded,
  reportLine,
  summaryLine,
} from "../../src/reconcile/report";
import type { RowOutcome, RowReport } from "../../src/reconcile/run";
import { operatorMnemonic } from "../orchestrator/mnemonic-scheme";

const payment: UnresolvedPayment = {
  paymentId: "pay_1",
  jobId: "job_1",
  jobStatus: "REPORT_WRITTEN",
  network: "algorand:test",
  assetId: "10458941",
  payTo: "PAYTO",
  amountMicros: 10_000,
  txId: null,
  expectedTxId: "TX1",
  lastValidRound: 2_000,
};

const row = (outcome: RowOutcome): RowReport => ({ payment, outcome });

describe("reconcile report lines", () => {
  it.each([
    [{ kind: "settled", txId: "TX1", round: 1_234 }, "SETTLED tx=TX1 round=1234"],
    [
      { kind: "released", currentRound: 2_001, lastValidRound: 2_000 },
      "RELEASED absent at round 2001, past last valid round 2000",
    ],
    [{ kind: "already_resolved", current: "SETTLED" }, "ALREADY_RESOLVED now SETTLED"],
    [
      { kind: "held", reason: "indexer_timeout", detail: "no answer within 10 ms" },
      "UNRESOLVED indexer_timeout: no answer within 10 ms",
    ],
    [{ kind: "failed", detail: "db down" }, "FAILED db down"],
  ] as const)("prints one line per row: %o", (outcome, text) => {
    expect(reportLine(row(outcome))).toBe(`pay_1 job=job_1 amount=0.01 USDC ${text}`);
  });

  it("summarises the run and fails while anything stays UNRESOLVED or failed", () => {
    const reports = [
      row({ kind: "settled", txId: "TX1", round: 1 }),
      row({ kind: "held", reason: "unconfirmed", detail: "pending" }),
    ];
    expect(summaryLine(reports, 1)).toBe(
      "checked=2 settled=1 released=0 already_resolved=0 held=1 failed=0 still_unresolved=1",
    );
    expect(reconcileSucceeded(reports, 1)).toBe(false);
    expect(reconcileSucceeded([row({ kind: "failed", detail: "x" })], 0)).toBe(false);
    expect(reconcileSucceeded([reports[0] ?? row({ kind: "failed", detail: "x" })], 0)).toBe(true);
    expect(reconcileSucceeded([], 0)).toBe(true);
  });
});

describe("reconcile limit", () => {
  it("defaults to a bounded batch and accepts 1 through the maximum", () => {
    expect(reconcileLimit(undefined)).toBe(defaultReconcileLimit);
    expect(reconcileLimit("1")).toBe(1);
    expect(reconcileLimit(String(maxReconcileLimit))).toBe(maxReconcileLimit);
  });

  it.each(["0", String(maxReconcileLimit + 1), "-5", "2.5", "ten", "", "1e2", "99999"])(
    "refuses %s",
    (raw) => {
      expect(reconcileLimit(raw)).toBeNull();
    },
  );
});

describe("reconcile configuration", () => {
  it("derives the operating address and keeps no mnemonic in the loaded config", () => {
    const env = loadReconcileEnv({
      DATABASE_URL: "postgres://selo@localhost:54330/selo",
      SELO_OPERATOR_MNEMONIC: operatorMnemonic,
    });
    expect(env).toEqual({
      DATABASE_URL: "postgres://selo@localhost:54330/selo",
      operatingAddress: algosdk.mnemonicToSecretKey(operatorMnemonic).addr.toString(),
    });
  });

  it("refuses a missing database url or mnemonic without echoing the mnemonic", () => {
    const databaseUrl = "postgres://selo@localhost/selo";
    expect(() => loadReconcileEnv({ SELO_OPERATOR_MNEMONIC: operatorMnemonic })).toThrow(
      /DATABASE_URL/,
    );
    expect(() => loadReconcileEnv({ DATABASE_URL: databaseUrl })).toThrow(/SELO_OPERATOR_MNEMONIC/);
    const words = operatorMnemonic.split(" ");
    let message = "";
    try {
      loadReconcileEnv({
        DATABASE_URL: databaseUrl,
        SELO_OPERATOR_MNEMONIC: words.slice(0, 24).join(" "),
      });
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/SELO_OPERATOR_MNEMONIC/);
    for (let start = 0; start + 3 <= 24; start += 1) {
      expect(message).not.toContain(words.slice(start, start + 3).join(" "));
    }
  });
});
