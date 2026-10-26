import algosdk from "algosdk";
import { beforeEach, describe, expect, it } from "vitest";
import { reconcileUnresolved } from "../../src/reconcile/run";
import { captureOutput } from "../orchestrator/harness";
import { resetDatabaseBetweenTests } from "../support";
import { FakeIndexer, type IndexerMode } from "./fake-indexer";
import {
  amountMicros,
  chainTransfer,
  confirmedRound,
  expectBalancedBooks,
  expectVerdictKept,
  fakeTxId,
  heldReason,
  paymentRow,
  reconcileDeps,
  roundTime,
  seedUnresolved,
  signedLastValid,
  testnet,
  type TransferShape,
} from "./fixtures";

resetDatabaseBetweenTests();
const output = captureOutput();
const indexer = new FakeIndexer();

beforeEach(() => {
  indexer.reset();
});

const reconcile = () => reconcileUnresolved(reconcileDeps(indexer), 10);
const alerts = (): string => output.stderr.join("");

async function expectStillUnresolved(paymentId: string, jobId: string): Promise<void> {
  expect(await paymentRow(paymentId)).toMatchObject({
    status: "UNRESOLVED",
    txId: null,
    settledAt: null,
    resolutionReason: heldReason,
  });
  const books = await expectBalancedBooks(jobId);
  expect(books.counters).toEqual({ settled: 0, reserved: 0, unresolved: amountMicros });
  await expectVerdictKept(jobId);
}

describe("reconciling an UNRESOLVED payment that landed on chain", () => {
  it("settles a confirmed matching transfer and moves the amount from unresolved to settled", async () => {
    const seeded = await seedUnresolved();
    const txId = seeded.expectedTxId ?? "";
    indexer.record(chainTransfer(txId));
    const [report] = await reconcile();
    expect(report?.outcome).toEqual({ kind: "settled", txId, round: confirmedRound });
    const row = await paymentRow(seeded.paymentId);
    expect(row).toMatchObject({ status: "SETTLED", txId, settledAt: new Date(roundTime * 1_000) });
    expect(row.resolutionReason).toBe(
      `reconciled: confirmed on chain in round ${String(confirmedRound)} as tx ${txId}; held because: ${heldReason}`,
    );
    const books = await expectBalancedBooks(seeded.jobId);
    expect(books.counters).toEqual({ settled: amountMicros, reserved: 0, unresolved: 0 });
    await expectVerdictKept(seeded.jobId);
    expect(indexer.requests).toEqual([`${testnet.indexerUrl}/v2/transactions?txid=${txId}`]);
  });

  it("falls back to the claimed tx id when no signed tx id was derived", async () => {
    const claimed = fakeTxId();
    const seeded = await seedUnresolved({
      expectedTxId: null,
      txId: claimed,
      lastValidRound: null,
    });
    indexer.record(chainTransfer(claimed));
    const [report] = await reconcile();
    expect(report?.outcome).toEqual({ kind: "settled", txId: claimed, round: confirmedRound });
    expect(indexer.requests).toEqual([`${testnet.indexerUrl}/v2/transactions?txid=${claimed}`]);
    expect((await expectBalancedBooks(seeded.jobId)).counters.settled).toBe(amountMicros);
  });

  it("holds a payment with no tx id at all without asking the indexer", async () => {
    const seeded = await seedUnresolved({ expectedTxId: null, txId: null });
    indexer.currentRound = signedLastValid + 1;
    const [report] = await reconcile();
    expect(report?.outcome).toMatchObject({ kind: "held", reason: "no_transaction_id" });
    expect(indexer.requests).toEqual([]);
    await expectStillUnresolved(seeded.paymentId, seeded.jobId);
  });
});

describe("reconciling an UNRESOLVED payment that is absent from chain", () => {
  it("releases it once the indexer is past the signed last valid round", async () => {
    const seeded = await seedUnresolved();
    indexer.currentRound = signedLastValid + 1;
    const [report] = await reconcile();
    expect(report?.outcome).toEqual({
      kind: "released",
      currentRound: signedLastValid + 1,
      lastValidRound: signedLastValid,
    });
    const row = await paymentRow(seeded.paymentId);
    expect(row).toMatchObject({ status: "RELEASED", txId: null, settledAt: null });
    expect(row.resolutionReason).toContain(`past last valid round ${String(signedLastValid)}`);
    const books = await expectBalancedBooks(seeded.jobId);
    expect(books.counters).toEqual({ settled: 0, reserved: 0, unresolved: 0 });
    expect(books.sums.released).toBe(amountMicros);
    await expectVerdictKept(seeded.jobId);
  });

  it.each([signedLastValid - 500, signedLastValid])(
    "keeps it UNRESOLVED while the indexer is at round %i and the transaction can still land",
    async (currentRound) => {
      const seeded = await seedUnresolved();
      indexer.currentRound = currentRound;
      const [report] = await reconcile();
      expect(report?.outcome).toMatchObject({ kind: "held", reason: "not_found_still_valid" });
      await expectStillUnresolved(seeded.paymentId, seeded.jobId);
      expect(alerts()).toContain(`event=downstream_still_unresolved jobId=${seeded.jobId}`);
      expect(alerts()).toContain("reason=not_found_still_valid");
    },
  );

  it("never releases a payment whose last valid round was not recorded", async () => {
    const seeded = await seedUnresolved({ lastValidRound: null });
    indexer.currentRound = 9_999_999;
    const [report] = await reconcile();
    expect(report?.outcome).toMatchObject({ kind: "held", reason: "no_last_valid_round" });
    await expectStillUnresolved(seeded.paymentId, seeded.jobId);
  });

  it("never releases on the absence of a claimed tx id that Selo did not sign", async () => {
    const seeded = await seedUnresolved({ expectedTxId: null, txId: fakeTxId() });
    indexer.currentRound = signedLastValid + 10;
    const [report] = await reconcile();
    expect(report?.outcome).toMatchObject({ kind: "held", reason: "no_last_valid_round" });
    expect(await paymentRow(seeded.paymentId)).toMatchObject({ status: "UNRESOLVED" });
  });
});

describe("evidence that does not prove the payment either way", () => {
  const conflicts: readonly (readonly [string, TransferShape])[] = [
    ["receiver", { receiver: algosdk.generateAccount().addr.toString() }],
    ["asset", { assetId: 31_566_704 }],
    ["amount", { amount: amountMicros + 1 }],
    ["sender", { sender: algosdk.generateAccount().addr.toString() }],
    ["transaction type", { txType: "pay" }],
  ];

  it.each(conflicts)(
    "holds a found transaction with a different %s and alerts",
    async (_, shape) => {
      const seeded = await seedUnresolved();
      indexer.record(chainTransfer(seeded.expectedTxId ?? "", shape));
      indexer.currentRound = signedLastValid + 1;
      const [report] = await reconcile();
      expect(report?.outcome).toMatchObject({ kind: "held", reason: "conflicting_transaction" });
      await expectStillUnresolved(seeded.paymentId, seeded.jobId);
      expect(alerts()).toContain("reason=conflicting_transaction");
    },
  );

  it("holds a transaction the indexer knows without a confirmed round", async () => {
    const seeded = await seedUnresolved();
    indexer.record(chainTransfer(seeded.expectedTxId ?? "", { confirmed: false }));
    const [report] = await reconcile();
    expect(report?.outcome).toMatchObject({ kind: "held", reason: "unconfirmed" });
    await expectStillUnresolved(seeded.paymentId, seeded.jobId);
  });

  const failures: readonly (readonly [IndexerMode, string])[] = [
    ["http_503", "indexer_unavailable"],
    ["hang", "indexer_timeout"],
    ["not_json", "indexer_malformed"],
    ["malformed", "indexer_malformed"],
  ];

  it.each(failures)("holds the payment when the indexer is %s", async (mode, reason) => {
    const seeded = await seedUnresolved();
    indexer.mode = mode;
    indexer.currentRound = signedLastValid + 1;
    const [report] = await reconcileUnresolved(reconcileDeps(indexer, { timeoutMs: 25 }), 10);
    expect(report?.outcome).toMatchObject({ kind: "held", reason });
    await expectStillUnresolved(seeded.paymentId, seeded.jobId);
    expect(alerts()).toContain(`reason=${reason}`);
  });
});

describe("payments reconciliation leaves alone", () => {
  it("does not look up a payment whose job has not reached a verdict", async () => {
    const seeded = await seedUnresolved({ jobStatus: "RUNNING" });
    indexer.currentRound = signedLastValid + 1;
    const [report] = await reconcile();
    expect(report?.outcome).toMatchObject({ kind: "held", reason: "job_active" });
    expect(indexer.requests).toEqual([]);
    expect(await paymentRow(seeded.paymentId)).toMatchObject({ status: "UNRESOLVED" });
  });

  it("does not look up a payment on a network Selo does not know", async () => {
    const seeded = await seedUnresolved({ network: "algorand-betanet" });
    const [report] = await reconcile();
    expect(report?.outcome).toMatchObject({ kind: "held", reason: "unsupported_network" });
    expect(indexer.requests).toEqual([]);
    await expectStillUnresolved(seeded.paymentId, seeded.jobId);
  });

  it("processes at most the requested number of rows, oldest first", async () => {
    const first = await seedUnresolved();
    await seedUnresolved();
    await seedUnresolved();
    const reports = await reconcileUnresolved(reconcileDeps(indexer), 2);
    expect(reports.map((report) => report.payment.paymentId)).toHaveLength(2);
    expect(reports[0]?.payment.paymentId).toBe(first.paymentId);
    expect(indexer.requests).toHaveLength(2);
  });
});
