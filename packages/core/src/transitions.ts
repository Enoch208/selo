import type { JobStatus, PaymentStatus, ScenarioStatus, Verdict } from "./contract";
import { verdicts } from "./contract";

export const jobTransitions: readonly (readonly [JobStatus, JobStatus])[] = [
  ["READY", "INBOUND_SETTLED"],
  ["READY", "INCONCLUSIVE"],
  ["INBOUND_SETTLED", "QUEUED"],
  ["INBOUND_SETTLED", "INCONCLUSIVE"],
  ["QUEUED", "RUNNING_PREFLIGHT_RECHECK"],
  ["QUEUED", "INCONCLUSIVE"],
  ["RUNNING_PREFLIGHT_RECHECK", "RUNNING"],
  ["RUNNING_PREFLIGHT_RECHECK", "INCONCLUSIVE"],
  ["RUNNING", "ANALYZING"],
  ["RUNNING", "FAIL"],
  ["RUNNING", "INCONCLUSIVE"],
  ["ANALYZING", "PASS"],
  ["ANALYZING", "FAIL"],
  ["ANALYZING", "INCONCLUSIVE"],
  ["PASS", "REPORT_WRITTEN"],
  ["FAIL", "REPORT_WRITTEN"],
  ["INCONCLUSIVE", "REPORT_WRITTEN"],
];

export function isLegalJobTransition(from: JobStatus, to: JobStatus): boolean {
  return jobTransitions.some(([legalFrom, legalTo]) => legalFrom === from && legalTo === to);
}

export function assertJobTransition(from: JobStatus, to: JobStatus): void {
  if (!isLegalJobTransition(from, to)) {
    throw new RangeError(`Illegal job transition ${from} -> ${to}`);
  }
}

const verdictStatuses: readonly JobStatus[] = [...verdicts];

export function isVerdictStatus(status: JobStatus): status is Verdict {
  return verdictStatuses.includes(status);
}

export function canStartDownstream(status: JobStatus): boolean {
  return status === "RUNNING";
}

export const scenarioTransitions: readonly (readonly [ScenarioStatus, ScenarioStatus])[] = [
  ["PLANNED", "POLICY_CHECKED"],
  ["PLANNED", "EVALUATED"],
  ["POLICY_CHECKED", "RESERVED"],
  ["POLICY_CHECKED", "REQUESTING"],
  ["POLICY_CHECKED", "EVALUATED"],
  ["RESERVED", "REQUESTING"],
  ["RESERVED", "EVALUATED"],
  ["REQUESTING", "SETTLED"],
  ["REQUESTING", "REJECTED"],
  ["REQUESTING", "TIMEOUT_UNRESOLVED"],
  ["REQUESTING", "EVALUATED"],
  ["SETTLED", "EVALUATED"],
  ["REJECTED", "EVALUATED"],
  ["TIMEOUT_UNRESOLVED", "EVALUATED"],
];

export function isLegalScenarioTransition(from: ScenarioStatus, to: ScenarioStatus): boolean {
  return scenarioTransitions.some(([legalFrom, legalTo]) => legalFrom === from && legalTo === to);
}

export function assertScenarioTransition(from: ScenarioStatus, to: ScenarioStatus): void {
  if (!isLegalScenarioTransition(from, to)) {
    throw new RangeError(`Illegal scenario transition ${from} -> ${to}`);
  }
}

export interface PaymentTransition {
  readonly from: PaymentStatus;
  readonly to: PaymentStatus;
}

export const paymentTransitions = {
  settle: { from: "RESERVED", to: "SETTLED" },
  release: { from: "RESERVED", to: "RELEASED" },
  markUnresolved: { from: "RESERVED", to: "UNRESOLVED" },
  reconcileSettled: { from: "UNRESOLVED", to: "SETTLED" },
  reconcileReleased: { from: "UNRESOLVED", to: "RELEASED" },
} as const satisfies Record<string, PaymentTransition>;

export type PaymentTransitionName = keyof typeof paymentTransitions;

export function isLegalPaymentTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  return Object.values(paymentTransitions).some(
    (transition) => transition.from === from && transition.to === to,
  );
}

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!isLegalPaymentTransition(from, to)) {
    throw new RangeError(`Illegal payment transition ${from} -> ${to}`);
  }
}

export interface SpendDelta {
  readonly reservedMicros: number;
  readonly settledMicros: number;
  readonly unresolvedMicros: number;
}

export function spendDelta(transition: PaymentTransition, amountMicros: number): SpendDelta {
  assertPaymentTransition(transition.from, transition.to);
  if (!Number.isSafeInteger(amountMicros) || amountMicros <= 0) {
    throw new RangeError(
      `Spend amount must be a positive safe integer, received ${String(amountMicros)}`,
    );
  }
  if (transition.to === "UNRESOLVED") {
    return { reservedMicros: -amountMicros, settledMicros: 0, unresolvedMicros: amountMicros };
  }
  if (transition.from === "UNRESOLVED" && transition.to === "SETTLED") {
    return { reservedMicros: 0, settledMicros: amountMicros, unresolvedMicros: -amountMicros };
  }
  if (transition.from === "UNRESOLVED" && transition.to === "RELEASED") {
    return { reservedMicros: 0, settledMicros: 0, unresolvedMicros: -amountMicros };
  }
  if (transition.to === "SETTLED") {
    return { reservedMicros: -amountMicros, settledMicros: amountMicros, unresolvedMicros: 0 };
  }
  return { reservedMicros: -amountMicros, settledMicros: 0, unresolvedMicros: 0 };
}
