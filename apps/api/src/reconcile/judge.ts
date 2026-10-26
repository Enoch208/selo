import type { UnresolvedPayment } from "./candidates";
import type { ChainLookup, ChainTransaction, IndexerFailure } from "./indexer";

export type HoldReason =
  | IndexerFailure
  | "job_active"
  | "unsupported_network"
  | "no_transaction_id"
  | "not_found_still_valid"
  | "no_last_valid_round"
  | "unconfirmed"
  | "conflicting_transaction"
  | "duplicate_tx";

export type Decision =
  | {
      readonly kind: "settle";
      readonly txId: string;
      readonly round: number;
      readonly settledAt: Date;
    }
  | { readonly kind: "release"; readonly currentRound: number; readonly lastValidRound: number }
  | { readonly kind: "hold"; readonly reason: HoldReason; readonly detail: string };

export const hold = (reason: HoldReason, detail: string): Decision => ({
  kind: "hold",
  reason,
  detail,
});

export interface LookupKey {
  readonly txId: string;
  readonly signedBySelo: boolean;
}

function differences(
  payment: UnresolvedPayment,
  transaction: ChainTransaction,
  operatorAddress: string,
): string[] {
  const transfer = transaction.assetTransfer;
  if (transaction.txType !== "axfer" || transfer === null) {
    return [`type ${transaction.txType} is not an asset transfer`];
  }
  const checks: readonly (readonly [boolean, string])[] = [
    [String(transfer.assetId) === payment.assetId, `asset ${String(transfer.assetId)}`],
    [transfer.receiver === payment.payTo, `receiver ${transfer.receiver}`],
    [transfer.amount === payment.amountMicros, `amount ${String(transfer.amount)} micro-units`],
    [transaction.sender === operatorAddress, `sender ${transaction.sender}`],
  ];
  return checks.filter(([matches]) => !matches).map(([, observed]) => observed);
}

function judgeFound(
  payment: UnresolvedPayment,
  transaction: ChainTransaction,
  operatorAddress: string,
): Decision {
  const mismatched = differences(payment, transaction, operatorAddress);
  if (mismatched.length > 0) {
    return hold(
      "conflicting_transaction",
      `tx ${transaction.id} on chain does not match the payment: ${mismatched.join(", ")}`,
    );
  }
  const { confirmedRound, roundTime } = transaction;
  if (confirmedRound === null || roundTime === null) {
    return hold("unconfirmed", `tx ${transaction.id} is known without a confirmed round and time`);
  }
  return {
    kind: "settle",
    txId: transaction.id,
    round: confirmedRound,
    settledAt: new Date(roundTime * 1_000),
  };
}

function judgeAbsent(payment: UnresolvedPayment, key: LookupKey, currentRound: number): Decision {
  const { lastValidRound } = payment;
  const absent = `tx ${key.txId} is not on chain at indexer round ${String(currentRound)}`;
  if (lastValidRound === null || !key.signedBySelo) {
    return hold("no_last_valid_round", `${absent}; no recorded last valid round proves it expired`);
  }
  if (currentRound <= lastValidRound) {
    return hold(
      "not_found_still_valid",
      `${absent}; it can still land through round ${String(lastValidRound)}`,
    );
  }
  return { kind: "release", currentRound, lastValidRound };
}

export function judge(
  payment: UnresolvedPayment,
  key: LookupKey,
  lookup: ChainLookup,
  operatorAddress: string,
): Decision {
  if (lookup.kind === "failed") {
    return hold(lookup.reason, lookup.detail);
  }
  if (lookup.kind === "absent") {
    return judgeAbsent(payment, key, lookup.currentRound);
  }
  return judgeFound(payment, lookup.transaction, operatorAddress);
}
