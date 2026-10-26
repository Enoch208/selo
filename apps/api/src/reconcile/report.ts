import { formatMicros } from "@selo/core";
import type { RowOutcome, RowReport } from "./run";

export const defaultReconcileLimit = 50;
export const maxReconcileLimit = 200;
export const indexerTimeoutMs = 10_000;

export function reconcileLimit(raw: string | undefined): number | null {
  if (raw === undefined) {
    return defaultReconcileLimit;
  }
  const value = /^\d{1,4}$/.test(raw) ? Number(raw) : 0;
  return value >= 1 && value <= maxReconcileLimit ? value : null;
}

function outcomeText(outcome: RowOutcome): string {
  switch (outcome.kind) {
    case "settled":
      return `SETTLED tx=${outcome.txId} round=${String(outcome.round)}`;
    case "released":
      return `RELEASED absent at round ${String(outcome.currentRound)}, past last valid round ${String(outcome.lastValidRound)}`;
    case "already_resolved":
      return `ALREADY_RESOLVED now ${outcome.current}`;
    case "held":
      return `UNRESOLVED ${outcome.reason}: ${outcome.detail}`;
    case "failed":
      return `FAILED ${outcome.detail}`;
  }
}

export function reportLine({ payment, outcome }: RowReport): string {
  const amount = `${formatMicros(payment.amountMicros)} USDC`;
  return `${payment.paymentId} job=${payment.jobId} amount=${amount} ${outcomeText(outcome)}`;
}

export function summaryLine(reports: readonly RowReport[], stillUnresolved: number): string {
  const tally = (kind: RowOutcome["kind"]): string =>
    String(reports.filter((report) => report.outcome.kind === kind).length);
  return [
    `checked=${String(reports.length)}`,
    `settled=${tally("settled")}`,
    `released=${tally("released")}`,
    `already_resolved=${tally("already_resolved")}`,
    `held=${tally("held")}`,
    `failed=${tally("failed")}`,
    `still_unresolved=${String(stillUnresolved)}`,
  ].join(" ");
}

export function reconcileSucceeded(
  reports: readonly RowReport[],
  stillUnresolved: number,
): boolean {
  return stillUnresolved === 0 && reports.every((report) => report.outcome.kind !== "failed");
}
