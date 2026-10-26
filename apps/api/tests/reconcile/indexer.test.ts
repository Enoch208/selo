import { describe, expect, it } from "vitest";
import {
  lookupTransaction,
  parseIndexerSearch,
  type IndexerFetch,
} from "../../src/reconcile/indexer";

const txId = "Q".repeat(52);
const indexerUrl = "https://testnet-idx.algonode.cloud";

const header = { id: txId, sender: "OPERATOR" };

const pending = {
  ...header,
  "tx-type": "axfer",
  "asset-transfer-transaction": { "asset-id": 10_458_941, amount: 10_000, receiver: "PAYTO" },
};

const transfer = { ...pending, "confirmed-round": 1_234, "round-time": 1_790_000_000 };

const search = (transactions: readonly unknown[], currentRound = 1_500) =>
  JSON.stringify({ "current-round": currentRound, transactions });

describe("parseIndexerSearch", () => {
  it("reads a confirmed asset transfer and the round the answer was computed at", () => {
    expect(parseIndexerSearch(search([transfer]), txId)).toEqual({
      kind: "found",
      currentRound: 1_500,
      transaction: {
        id: txId,
        sender: "OPERATOR",
        txType: "axfer",
        confirmedRound: 1_234,
        roundTime: 1_790_000_000,
        assetTransfer: { assetId: 10_458_941, amount: 10_000, receiver: "PAYTO" },
      },
    });
  });

  it("reports an empty result as absent at the indexer's current round", () => {
    expect(parseIndexerSearch(search([], 2_001), txId)).toEqual({
      kind: "absent",
      currentRound: 2_001,
    });
  });

  it("keeps partial evidence partial instead of inventing a confirmation", () => {
    expect(parseIndexerSearch(search([pending]), txId)).toMatchObject({
      kind: "found",
      transaction: { confirmedRound: null, roundTime: null },
    });
  });

  it("reads an omitted transfer amount as zero and a non-transfer as having none", () => {
    const payment = { ...header, "tx-type": "pay", "confirmed-round": 1_234 };
    expect(parseIndexerSearch(search([payment]), txId)).toMatchObject({
      transaction: { txType: "pay", assetTransfer: null },
    });
    const zero = { ...transfer, "asset-transfer-transaction": { "asset-id": 1, receiver: "X" } };
    expect(parseIndexerSearch(search([zero]), txId)).toMatchObject({
      transaction: { assetTransfer: { assetId: 1, amount: 0, receiver: "X" } },
    });
  });

  it.each([
    ["text that is not JSON", "<html>"],
    ["JSON without a current round", JSON.stringify({ transactions: [] })],
    ["a transaction with a non-numeric round", search([{ ...transfer, "confirmed-round": "1" }])],
    ["a transfer without a receiver", search([{ ...transfer, "asset-transfer-transaction": {} }])],
    ["a different transaction", search([{ ...transfer, id: "OTHER" }])],
    ["two transactions for one id", search([transfer, transfer])],
    ["a negative current round", search([], -1)],
  ])("treats %s as malformed", (_, text) => {
    expect(parseIndexerSearch(text, txId)).toMatchObject({
      kind: "failed",
      reason: "indexer_malformed",
    });
  });
});

describe("lookupTransaction", () => {
  const lookup = (fetch: IndexerFetch, timeoutMs = 1_000) =>
    lookupTransaction({ fetch, indexerUrl, txId, timeoutMs });

  it("asks the indexer's transaction search for exactly this tx id", async () => {
    const urls: string[] = [];
    const result = await lookup((url) => {
      urls.push(url);
      return Promise.resolve(new Response(search([transfer])));
    });
    expect(urls).toEqual([`${indexerUrl}/v2/transactions?txid=${txId}`]);
    expect(result.kind).toBe("found");
  });

  it.each([429, 500, 503, 404])(
    "reports HTTP %i as the indexer being unavailable",
    async (status) => {
      const result = await lookup(() => Promise.resolve(new Response("no", { status })));
      expect(result).toEqual({
        kind: "failed",
        reason: "indexer_unavailable",
        detail: `the indexer answered HTTP ${String(status)}`,
      });
    },
  );

  it("reports a connection failure as the indexer being unavailable", async () => {
    const result = await lookup(() => Promise.reject(new TypeError("fetch failed")));
    expect(result).toMatchObject({ kind: "failed", reason: "indexer_unavailable" });
  });

  it("gives up on an indexer that never answers within the timeout", async () => {
    const started = Date.now();
    const result = await lookup(() => new Promise<Response>(() => undefined), 30);
    expect(result).toMatchObject({ kind: "failed", reason: "indexer_timeout" });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("gives up on a body that stalls after the headers", async () => {
    const stalled = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"current-round":'));
      },
    });
    const result = await lookup(() => Promise.resolve(new Response(stalled)), 30);
    expect(result).toMatchObject({ kind: "failed", reason: "indexer_timeout" });
  });

  it("refuses an answer larger than any single-transaction search", async () => {
    const huge = new Response("x".repeat(300_000));
    expect(await lookup(() => Promise.resolve(huge))).toMatchObject({
      kind: "failed",
      reason: "indexer_malformed",
    });
  });
});
