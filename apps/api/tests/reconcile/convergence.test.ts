import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { releaseJobs } from "../../src/db/schema";
import { unresolvedPayments } from "../../src/reconcile/candidates";
import { applyDecision, assessPayment, reconcileUnresolved } from "../../src/reconcile/run";
import { separateConnections } from "../ledger/fixtures";
import { captureOutput } from "../orchestrator/harness";
import { db, resetDatabaseBetweenTests } from "../support";
import { FakeIndexer } from "./fake-indexer";
import {
  amountMicros,
  chainTransfer,
  confirmedRound,
  expectBalancedBooks,
  expectVerdictKept,
  paymentRow,
  reconcileDeps,
  seedUnresolved,
  signedLastValid,
} from "./fixtures";

resetDatabaseBetweenTests();
const output = captureOutput();
const indexer = new FakeIndexer();
const [left, right] = separateConnections(2);

beforeEach(() => {
  indexer.reset();
});

function workers() {
  if (left === undefined || right === undefined) {
    throw new Error("separate connections were not created");
  }
  return [left, right] as const;
}

describe("two reconcilers on separate connections", () => {
  it("settle a payment exactly once and keep the books equal to the payment rows", async () => {
    const seeded = await seedUnresolved();
    indexer.record(chainTransfer(seeded.expectedTxId ?? ""));
    indexer.answerTogetherAfter(2);
    const runs = await Promise.all(
      workers().map((worker) => reconcileUnresolved(reconcileDeps(indexer, { db: worker }), 10)),
    );
    const outcomes = runs.flat().map((report) => report.outcome.kind);
    expect(outcomes.sort()).toEqual(["already_resolved", "settled"]);
    expect(indexer.requests).toHaveLength(2);
    const books = await expectBalancedBooks(seeded.jobId);
    expect(books.counters).toEqual({ settled: amountMicros, reserved: 0, unresolved: 0 });
    await expectVerdictKept(seeded.jobId);
  });

  it("release a payment exactly once", async () => {
    const seeded = await seedUnresolved();
    indexer.currentRound = signedLastValid + 1;
    indexer.answerTogetherAfter(2);
    const runs = await Promise.all(
      workers().map((worker) => reconcileUnresolved(reconcileDeps(indexer, { db: worker }), 10)),
    );
    expect(runs.flat().map((report) => report.outcome)).toEqual(
      expect.arrayContaining([
        { kind: "already_resolved", current: "RELEASED" },
        { kind: "released", currentRound: signedLastValid + 1, lastValidRound: signedLastValid },
      ]),
    );
    const books = await expectBalancedBooks(seeded.jobId);
    expect(books.counters).toEqual({ settled: 0, reserved: 0, unresolved: 0 });
    expect(books.sums.released).toBe(amountMicros);
  });
});

describe("repeated and interrupted reconciliation", () => {
  it("a second run after a settlement finds nothing and changes nothing", async () => {
    const seeded = await seedUnresolved();
    indexer.record(chainTransfer(seeded.expectedTxId ?? ""));
    await reconcileUnresolved(reconcileDeps(indexer), 10);
    const settled = await paymentRow(seeded.paymentId);
    const books = await expectBalancedBooks(seeded.jobId);
    expect(await reconcileUnresolved(reconcileDeps(indexer), 10)).toEqual([]);
    expect(await paymentRow(seeded.paymentId)).toEqual(settled);
    expect(await expectBalancedBooks(seeded.jobId)).toEqual(books);
  });

  it("a held payment stays exactly as it was across repeated runs", async () => {
    const seeded = await seedUnresolved();
    indexer.currentRound = signedLastValid - 1;
    const before = await paymentRow(seeded.paymentId);
    for (let run = 0; run < 3; run += 1) {
      const [report] = await reconcileUnresolved(reconcileDeps(indexer), 10);
      expect(report?.outcome).toMatchObject({ kind: "held", reason: "not_found_still_valid" });
    }
    expect(await paymentRow(seeded.paymentId)).toEqual(before);
    expect((await expectBalancedBooks(seeded.jobId)).counters.unresolved).toBe(amountMicros);
  });

  it("a run stopped after reading converges on the next run, and its late write is a no-op", async () => {
    const seeded = await seedUnresolved();
    indexer.record(chainTransfer(seeded.expectedTxId ?? ""));
    const [payment] = await unresolvedPayments(db, 10);
    if (payment === undefined) {
      throw new Error("the seeded payment was not listed");
    }
    const staleDecision = await assessPayment(reconcileDeps(indexer), payment);
    expect(staleDecision.kind).toBe("settle");
    expect(await paymentRow(seeded.paymentId)).toMatchObject({ status: "UNRESOLVED" });
    const [next] = await reconcileUnresolved(reconcileDeps(indexer), 10);
    expect(next?.outcome.kind).toBe("settled");
    const books = await expectBalancedBooks(seeded.jobId);
    expect(await applyDecision(db, payment, staleDecision)).toEqual({
      kind: "already_resolved",
      current: "SETTLED",
    });
    expect(await expectBalancedBooks(seeded.jobId)).toEqual(books);
  });

  it("rolls the payment back when the job counters cannot move, then converges once they can", async () => {
    const seeded = await seedUnresolved();
    indexer.currentRound = signedLastValid + 1;
    await db
      .update(releaseJobs)
      .set({ unresolvedSpendMicros: 0 })
      .where(eq(releaseJobs.id, seeded.jobId));
    const [failed] = await reconcileUnresolved(reconcileDeps(indexer), 10);
    expect(failed?.outcome.kind).toBe("failed");
    expect(await paymentRow(seeded.paymentId)).toMatchObject({ status: "UNRESOLVED" });
    expect(output.stderr.join("")).toContain(
      `event=downstream_reconcile_failed jobId=${seeded.jobId}`,
    );
    await db
      .update(releaseJobs)
      .set({ unresolvedSpendMicros: amountMicros })
      .where(eq(releaseJobs.id, seeded.jobId));
    const [recovered] = await reconcileUnresolved(reconcileDeps(indexer), 10);
    expect(recovered?.outcome.kind).toBe("released");
    expect((await expectBalancedBooks(seeded.jobId)).counters.unresolved).toBe(0);
  });

  it("holds a payment whose confirmed tx id another payment already records", async () => {
    const first = await seedUnresolved();
    const txId = first.expectedTxId ?? "";
    const second = await seedUnresolved({ expectedTxId: txId });
    indexer.record(chainTransfer(txId));
    const reports = await reconcileUnresolved(reconcileDeps(indexer), 10);
    expect(reports.map((report) => report.outcome)).toEqual([
      { kind: "settled", txId, round: confirmedRound },
      expect.objectContaining({ kind: "held", reason: "duplicate_tx" }),
    ]);
    expect(await paymentRow(second.paymentId)).toMatchObject({ status: "UNRESOLVED", txId: null });
    expect((await expectBalancedBooks(second.jobId)).counters.unresolved).toBe(amountMicros);
  });
});
