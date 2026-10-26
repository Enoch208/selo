import { z } from "zod";
import { readLimitedText } from "../net/limited-body";
import { messageChain, withDeadline } from "../payments/transport";

export type IndexerFetch = (
  url: string,
  init: { readonly signal: AbortSignal },
) => Promise<Response>;

export const liveIndexerFetch: IndexerFetch = (url, init) =>
  fetch(url, { signal: init.signal, redirect: "error", headers: { accept: "application/json" } });

const round = z.number().int().nonnegative();

const assetTransferSchema = z.object({
  "asset-id": z.number().int().nonnegative(),
  amount: z.number().int().nonnegative().default(0),
  receiver: z.string().min(1),
});

const transactionSchema = z.object({
  id: z.string().min(1),
  sender: z.string().min(1),
  "tx-type": z.string().min(1),
  "confirmed-round": round.optional(),
  "round-time": round.optional(),
  "asset-transfer-transaction": assetTransferSchema.optional(),
});

const searchSchema = z.object({
  "current-round": round,
  transactions: z.array(transactionSchema),
});

export interface ChainTransaction {
  readonly id: string;
  readonly sender: string;
  readonly txType: string;
  readonly confirmedRound: number | null;
  readonly roundTime: number | null;
  readonly assetTransfer: {
    readonly assetId: number;
    readonly amount: number;
    readonly receiver: string;
  } | null;
}

export type IndexerFailure = "indexer_unavailable" | "indexer_timeout" | "indexer_malformed";

export type ChainLookup =
  | {
      readonly kind: "found";
      readonly currentRound: number;
      readonly transaction: ChainTransaction;
    }
  | { readonly kind: "absent"; readonly currentRound: number }
  | { readonly kind: "failed"; readonly reason: IndexerFailure; readonly detail: string };

const maxBodyBytes = 262_144;

const failed = (reason: IndexerFailure, detail: string): ChainLookup => ({
  kind: "failed",
  reason,
  detail,
});

function chainTransaction(raw: z.infer<typeof transactionSchema>): ChainTransaction {
  const transfer = raw["asset-transfer-transaction"];
  return {
    id: raw.id,
    sender: raw.sender,
    txType: raw["tx-type"],
    confirmedRound: raw["confirmed-round"] ?? null,
    roundTime: raw["round-time"] ?? null,
    assetTransfer:
      transfer === undefined
        ? null
        : { assetId: transfer["asset-id"], amount: transfer.amount, receiver: transfer.receiver },
  };
}

type JsonRead = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

function readJson(text: string): JsonRead {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

export function parseIndexerSearch(text: string, txId: string): ChainLookup {
  const json = readJson(text);
  if (!json.ok) {
    return failed("indexer_malformed", "the indexer answer is not JSON");
  }
  const parsed = searchSchema.safeParse(json.value);
  if (!parsed.success) {
    return failed("indexer_malformed", "the indexer answer is not a transaction search result");
  }
  const currentRound = parsed.data["current-round"];
  const [first, ...rest] = parsed.data.transactions;
  if (first === undefined) {
    return { kind: "absent", currentRound };
  }
  if (rest.length > 0 || first.id !== txId) {
    return failed(
      "indexer_malformed",
      `the indexer answered with a transaction other than ${txId}`,
    );
  }
  return { kind: "found", currentRound, transaction: chainTransaction(first) };
}

export interface IndexerQuery {
  readonly fetch: IndexerFetch;
  readonly indexerUrl: string;
  readonly txId: string;
  readonly timeoutMs: number;
}

async function readSearch(
  response: Response,
  query: IndexerQuery,
  deadline: AbortSignal,
): Promise<ChainLookup> {
  if (response.status !== 200) {
    await response.body?.cancel();
    return failed("indexer_unavailable", `the indexer answered HTTP ${String(response.status)}`);
  }
  const read = await withDeadline(readLimitedText(response, maxBodyBytes), deadline);
  if (read.ok) {
    return parseIndexerSearch(read.text, query.txId);
  }
  if (read.kind === "too_large") {
    return failed("indexer_malformed", `the indexer answer exceeded ${String(maxBodyBytes)} bytes`);
  }
  return read.kind === "timeout" || deadline.aborted
    ? failed("indexer_timeout", `no complete answer within ${String(query.timeoutMs)} ms`)
    : failed("indexer_unavailable", messageChain(read.cause));
}

export async function lookupTransaction(query: IndexerQuery): Promise<ChainLookup> {
  const url = `${query.indexerUrl}/v2/transactions?txid=${encodeURIComponent(query.txId)}`;
  const deadline = AbortSignal.timeout(query.timeoutMs);
  try {
    const response = await withDeadline(query.fetch(url, { signal: deadline }), deadline);
    return await readSearch(response, query, deadline);
  } catch (error: unknown) {
    return deadline.aborted
      ? failed("indexer_timeout", `no answer within ${String(query.timeoutMs)} ms`)
      : failed("indexer_unavailable", messageChain(error));
  }
}
