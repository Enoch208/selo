import { formatMicros, isVerdictStatus, type JobStatus, type PaymentStatus } from "@selo/core";
import type { Db } from "../db/client";
import {
  reconcileReleasedDownstream,
  reconcileSettledDownstream,
  type TransitionResult,
} from "../ledger/transitions";
import { alert, describeError } from "../orchestrator/log";
import { networkNameOf, seloNetworks } from "../payments/networks";
import { unresolvedPayments, type UnresolvedPayment } from "./candidates";
import { lookupTransaction, type IndexerFetch } from "./indexer";
import { hold, judge, type Decision, type HoldReason, type LookupKey } from "./judge";

export interface ReconcileDeps {
  readonly db: Db;
  readonly fetch: IndexerFetch;
  readonly operatorAddress: string;
  readonly timeoutMs: number;
}

export type RowOutcome =
  | { readonly kind: "settled"; readonly txId: string; readonly round: number }
  | { readonly kind: "released"; readonly currentRound: number; readonly lastValidRound: number }
  | { readonly kind: "already_resolved"; readonly current: PaymentStatus }
  | { readonly kind: "held"; readonly reason: HoldReason; readonly detail: string }
  | { readonly kind: "failed"; readonly detail: string };

export interface RowReport {
  readonly payment: UnresolvedPayment;
  readonly outcome: RowOutcome;
}

const concluded = (status: JobStatus): boolean =>
  isVerdictStatus(status) || status === "REPORT_WRITTEN";

function lookupKey(payment: UnresolvedPayment): LookupKey | null {
  if (payment.expectedTxId !== null) {
    return { txId: payment.expectedTxId, signedBySelo: true };
  }
  return payment.txId === null ? null : { txId: payment.txId, signedBySelo: false };
}

export async function assessPayment(
  deps: ReconcileDeps,
  payment: UnresolvedPayment,
): Promise<Decision> {
  if (!concluded(payment.jobStatus)) {
    return hold("job_active", `job is still ${payment.jobStatus}; reconcile after its verdict`);
  }
  const name = networkNameOf(payment.network);
  if (name === null) {
    return hold("unsupported_network", `${payment.network} is not Algorand Mainnet or Testnet`);
  }
  const key = lookupKey(payment);
  if (key === null) {
    return hold("no_transaction_id", "neither a signed nor a claimed tx id was recorded");
  }
  const lookup = await lookupTransaction({
    fetch: deps.fetch,
    indexerUrl: seloNetworks[name].indexerUrl,
    txId: key.txId,
    timeoutMs: deps.timeoutMs,
  });
  return judge(payment, key, lookup, deps.operatorAddress);
}

function notApplied(result: TransitionResult, txId: string | null): RowOutcome | null {
  if (result.applied) {
    return null;
  }
  if ("reason" in result) {
    const detail = `tx ${txId ?? "unknown"} is already recorded on another payment`;
    return { kind: "held", reason: "duplicate_tx", detail };
  }
  return { kind: "already_resolved", current: result.current };
}

export async function applyDecision(
  db: Db,
  payment: UnresolvedPayment,
  decision: Decision,
): Promise<RowOutcome> {
  if (decision.kind === "hold") {
    return { kind: "held", reason: decision.reason, detail: decision.detail };
  }
  if (decision.kind === "settle") {
    const { txId, round, settledAt } = decision;
    const reason = `reconciled: confirmed on chain in round ${String(round)} as tx ${txId}`;
    const result = await reconcileSettledDownstream(db, payment.paymentId, {
      txId,
      settledAt,
      reason,
    });
    return notApplied(result, txId) ?? { kind: "settled", txId, round };
  }
  const { currentRound, lastValidRound } = decision;
  const reason = `reconciled: absent from chain at round ${String(currentRound)}, past last valid round ${String(lastValidRound)}`;
  const result = await reconcileReleasedDownstream(db, payment.paymentId, reason);
  return notApplied(result, null) ?? { kind: "released", currentRound, lastValidRound };
}

async function reconcileOne(deps: ReconcileDeps, payment: UnresolvedPayment): Promise<RowOutcome> {
  try {
    return await applyDecision(deps.db, payment, await assessPayment(deps, payment));
  } catch (error: unknown) {
    return { kind: "failed", detail: describeError(error) };
  }
}

function alertIfStillOpen(payment: UnresolvedPayment, outcome: RowOutcome): void {
  const amountUsdc = formatMicros(payment.amountMicros);
  const { paymentId, jobId } = payment;
  if (outcome.kind === "held") {
    const { reason, detail } = outcome;
    alert("downstream_still_unresolved", jobId, { paymentId, amountUsdc, reason, detail });
  }
  if (outcome.kind === "failed") {
    alert("downstream_reconcile_failed", jobId, { paymentId, amountUsdc, cause: outcome.detail });
  }
}

export async function reconcileUnresolved(
  deps: ReconcileDeps,
  limit: number,
): Promise<readonly RowReport[]> {
  const reports: RowReport[] = [];
  for (const payment of await unresolvedPayments(deps.db, limit)) {
    const outcome = await reconcileOne(deps, payment);
    alertIfStillOpen(payment, outcome);
    reports.push({ payment, outcome });
  }
  return reports;
}
