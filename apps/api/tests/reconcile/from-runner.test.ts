import algosdk from "algosdk";
import { beforeEach, describe, expect, it } from "vitest";
import { jobBooks } from "../../src/ledger/books";
import { reconcileUnresolved } from "../../src/reconcile/run";
import { db } from "../support";
import {
  captureOutput,
  jobRow,
  paymentRows,
  runnerWith,
  scheme,
  seedRunnableJob,
  seller,
  useOrchestratorHarness,
} from "../orchestrator/harness";
import { operatorMnemonic } from "../orchestrator/mnemonic-scheme";
import { targetNetwork, targetPayTo } from "../orchestrator/stock-seller";
import { FakeIndexer } from "./fake-indexer";

useOrchestratorHarness();
captureOutput();
const indexer = new FakeIndexer();
const operatorAddress = algosdk.mnemonicToSecretKey(operatorMnemonic).addr.toString();

beforeEach(() => {
  indexer.reset();
});

const reconcile = () =>
  reconcileUnresolved({ db, fetch: indexer.fetch, operatorAddress, timeoutMs: 1_000 }, 10);

async function unresolvedRun(): Promise<{ jobId: string; txId: string }> {
  seller.facilitator.fixedTxId = "";
  const jobId = await seedRunnableJob();
  const report = await runnerWith().run(jobId);
  expect(report.inconclusiveReason).toBe("PAYMENT_UNRESOLVED");
  return { jobId, txId: scheme.signedTxIds[0] ?? "" };
}

const verdictOf = async (jobId: string) => {
  const { status, verdict, inconclusiveReason, reportTokenHash } = await jobRow(jobId);
  return { status, verdict, inconclusiveReason, reportTokenHash };
};

describe("reconciling a payment the runner left UNRESOLVED", () => {
  it("settles it from the signed transfer found on chain and keeps the INCONCLUSIVE verdict", async () => {
    const { jobId, txId } = await unresolvedRun();
    const verdict = await verdictOf(jobId);
    indexer.record({
      id: txId,
      sender: operatorAddress,
      "tx-type": "axfer",
      "confirmed-round": 1_900,
      "round-time": 1_790_000_000,
      "asset-transfer-transaction": {
        "asset-id": Number(targetNetwork.usdcAssetId),
        amount: 10_000,
        receiver: targetPayTo,
      },
    });
    const [report] = await reconcile();
    expect(report?.outcome).toEqual({ kind: "settled", txId, round: 1_900 });
    expect(await paymentRows(jobId)).toMatchObject([{ status: "SETTLED", txId }]);
    expect((await jobBooks(db, jobId)).counters).toEqual({
      settled: 10_000,
      reserved: 0,
      unresolved: 0,
    });
    expect(await verdictOf(jobId)).toEqual(verdict);
    expect(verdict).toMatchObject({ status: "REPORT_WRITTEN", verdict: "INCONCLUSIVE" });
  });

  it("releases it once the network is past the signed last valid round", async () => {
    const { jobId } = await unresolvedRun();
    const verdict = await verdictOf(jobId);
    indexer.currentRound = 2_001;
    const [report] = await reconcile();
    expect(report?.outcome).toEqual({
      kind: "released",
      currentRound: 2_001,
      lastValidRound: 2_000,
    });
    expect((await jobBooks(db, jobId)).counters).toEqual({
      settled: 0,
      reserved: 0,
      unresolved: 0,
    });
    expect(await verdictOf(jobId)).toEqual(verdict);
  });
});
