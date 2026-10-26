import { randomBytes } from "node:crypto";
import algosdk from "algosdk";
import { eq } from "drizzle-orm";
import { expect } from "vitest";
import type { Db } from "../../src/db/client";
import { downstreamPayments, releaseJobs } from "../../src/db/schema";
import { jobBooks } from "../../src/ledger/books";
import { reserveDownstream } from "../../src/ledger/reserve";
import { markDownstreamUnresolved } from "../../src/ledger/transitions";
import { seloNetworks } from "../../src/payments/networks";
import type { ReconcileDeps } from "../../src/reconcile/run";
import { now, origin, reserveInput, seedJob } from "../ledger/fixtures";
import { db } from "../support";
import type { ChainJson, FakeIndexer } from "./fake-indexer";

export const testnet = seloNetworks["algorand-testnet"];
export const operatorAddress = algosdk.generateAccount().addr.toString();
export const payTo = algosdk.generateAccount().addr.toString();
export const amountMicros = 10_000;
export const signedLastValid = 2_000;
export const confirmedRound = 1_234;
export const roundTime = 1_790_000_000;
export const heldReason = "ambiguous outcome: timeout";

export const fakeTxId = (): string =>
  algosdk.encodeAddress(new Uint8Array(randomBytes(32))).slice(0, 52);

export interface UnresolvedSeed {
  readonly expectedTxId?: string | null;
  readonly txId?: string | null;
  readonly lastValidRound?: number | null;
  readonly network?: string;
  readonly jobStatus?: "RUNNING" | "REPORT_WRITTEN";
}

export interface SeededPayment {
  readonly jobId: string;
  readonly paymentId: string;
  readonly expectedTxId: string | null;
}

export async function seedUnresolved(seed: UnresolvedSeed = {}): Promise<SeededPayment> {
  const network = seed.network ?? testnet.caip2;
  const job = await seedJob({ maxSpendMicros: 100_000 });
  const reservation = await reserveDownstream(
    db,
    reserveInput(job, amountMicros, {
      payment: {
        origin,
        network,
        asset: testnet.usdcAssetId,
        amountMicros,
        payTo,
        requirementsHash: "c".repeat(64),
      },
      allowedNetwork: network,
      allowedAsset: testnet.usdcAssetId,
    }),
  );
  if (!reservation.reserved) {
    throw new Error(`seed reservation denied: ${reservation.reason}`);
  }
  const { paymentId } = reservation;
  await markDownstreamUnresolved(db, paymentId, { reason: heldReason, requestedAt: now });
  const expectedTxId = seed.expectedTxId === undefined ? fakeTxId() : seed.expectedTxId;
  await db
    .update(downstreamPayments)
    .set({
      expectedTxId,
      txId: seed.txId ?? null,
      lastValidRound: seed.lastValidRound === undefined ? signedLastValid : seed.lastValidRound,
    })
    .where(eq(downstreamPayments.id, paymentId));
  if ((seed.jobStatus ?? "REPORT_WRITTEN") === "REPORT_WRITTEN") {
    await db
      .update(releaseJobs)
      .set({
        status: "REPORT_WRITTEN",
        verdict: "INCONCLUSIVE",
        inconclusiveReason: "PAYMENT_UNRESOLVED",
      })
      .where(eq(releaseJobs.id, job.jobId));
  }
  return { jobId: job.jobId, paymentId, expectedTxId };
}

export interface TransferShape {
  readonly sender?: string;
  readonly receiver?: string;
  readonly assetId?: number;
  readonly amount?: number;
  readonly txType?: string;
  readonly confirmed?: boolean;
}

export function chainTransfer(id: string, shape: TransferShape = {}): ChainJson & { id: string } {
  const confirmation =
    shape.confirmed === false
      ? {}
      : { "confirmed-round": confirmedRound, "round-time": roundTime, "intra-round-offset": 0 };
  return {
    id,
    sender: shape.sender ?? operatorAddress,
    "tx-type": shape.txType ?? "axfer",
    fee: 0,
    "first-valid": 1_000,
    "last-valid": signedLastValid,
    "asset-transfer-transaction": {
      "asset-id": shape.assetId ?? Number(testnet.usdcAssetId),
      amount: shape.amount ?? amountMicros,
      receiver: shape.receiver ?? payTo,
      "close-amount": 0,
    },
    ...confirmation,
  };
}

export function reconcileDeps(
  indexer: FakeIndexer,
  overrides: Partial<ReconcileDeps> = {},
): ReconcileDeps {
  return { db, fetch: indexer.fetch, operatorAddress, timeoutMs: 1_000, ...overrides };
}

export async function paymentRow(paymentId: string, on: Db = db) {
  const [row] = await on
    .select()
    .from(downstreamPayments)
    .where(eq(downstreamPayments.id, paymentId));
  if (row === undefined) {
    throw new Error(`payment ${paymentId} is missing`);
  }
  return row;
}

export async function expectBalancedBooks(jobId: string) {
  const books = await jobBooks(db, jobId);
  expect(books.counters).toEqual({
    settled: books.sums.settled,
    reserved: books.sums.reserved,
    unresolved: books.sums.unresolved,
  });
  expect(
    books.counters.settled + books.counters.reserved + books.counters.unresolved,
  ).toBeLessThanOrEqual(books.maxSpendMicros);
  return books;
}

export async function expectVerdictKept(jobId: string): Promise<void> {
  const [job] = await db.select().from(releaseJobs).where(eq(releaseJobs.id, jobId));
  expect(job).toMatchObject({
    status: "REPORT_WRITTEN",
    verdict: "INCONCLUSIVE",
    inconclusiveReason: "PAYMENT_UNRESOLVED",
  });
}
