import type { AuthorizationStatus, JobStatus, SpendDenialReason } from "./contract";
import { spendDenialReasons } from "./contract";

export interface SpendGuardAuthorization {
  readonly status: AuthorizationStatus;
  readonly origin: string;
  readonly expiresAt: Date;
}

export interface SpendGuardJob {
  readonly status: JobStatus;
  readonly maxSpendMicros: number;
  readonly settledMicros: number;
  readonly reservedMicros: number;
  readonly unresolvedMicros: number;
}

export interface SpendGuardPayment {
  readonly origin: string;
  readonly network: string;
  readonly asset: string;
  readonly amountMicros: number;
}

export interface SpendGuardInput {
  readonly authorization: SpendGuardAuthorization | null;
  readonly job: SpendGuardJob;
  readonly payment: SpendGuardPayment;
  readonly scenarioMaxSpendMicros: number;
  readonly absoluteCapMicros: number;
  readonly allowedNetwork: string;
  readonly allowedAsset: string;
  readonly now: Date;
}

export type SpendGuardResult =
  { readonly allowed: true } | { readonly allowed: false; readonly reason: SpendDenialReason };

export const spendGuardChecks = [
  { reason: "AUTHORIZATION_INVALID", label: "Authorization is verified" },
  { reason: "AUTHORIZATION_EXPIRED", label: "Authorization has not expired" },
  { reason: "JOB_NOT_RUNNING", label: "Job is running" },
  { reason: "ORIGIN_NOT_AUTHORIZED", label: "Payment origin matches the authorized origin" },
  { reason: "NETWORK_NOT_ALLOWED", label: "Payment network is allowed" },
  { reason: "ASSET_NOT_ALLOWED", label: "Payment asset is allowed" },
  { reason: "PAYMENT_UNRESOLVED", label: "No unresolved payment is outstanding" },
  { reason: "SCENARIO_BUDGET_EXCEEDED", label: "Amount is within the scenario budget" },
  { reason: "JOB_BUDGET_EXCEEDED", label: "Amount is within the job budget" },
  { reason: "ABSOLUTE_CAP_EXCEEDED", label: "Job budget is within the absolute cap" },
] as const satisfies readonly { readonly reason: SpendDenialReason; readonly label: string }[];

const passes: Record<SpendDenialReason, (input: SpendGuardInput) => boolean> = {
  AUTHORIZATION_INVALID: ({ authorization }) =>
    authorization !== null && authorization.status === "VERIFIED",
  AUTHORIZATION_EXPIRED: ({ authorization, now }) =>
    authorization !== null && now.getTime() < authorization.expiresAt.getTime(),
  JOB_NOT_RUNNING: ({ job }) => job.status === "RUNNING",
  ORIGIN_NOT_AUTHORIZED: ({ authorization, payment }) =>
    authorization !== null && payment.origin === authorization.origin,
  NETWORK_NOT_ALLOWED: ({ payment, allowedNetwork }) => payment.network === allowedNetwork,
  ASSET_NOT_ALLOWED: ({ payment, allowedAsset }) => payment.asset === allowedAsset,
  PAYMENT_UNRESOLVED: ({ job }) => job.unresolvedMicros === 0,
  SCENARIO_BUDGET_EXCEEDED: ({ payment, scenarioMaxSpendMicros }) =>
    payment.amountMicros <= scenarioMaxSpendMicros,
  JOB_BUDGET_EXCEEDED: ({ job, payment }) =>
    job.settledMicros + job.reservedMicros + job.unresolvedMicros + payment.amountMicros <=
    job.maxSpendMicros,
  ABSOLUTE_CAP_EXCEEDED: ({ job, absoluteCapMicros }) => job.maxSpendMicros <= absoluteCapMicros,
};

export function evaluateSpend(input: SpendGuardInput): SpendGuardResult {
  const amount = input.payment.amountMicros;
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new RangeError(
      `Spend amount must be a positive safe integer, received ${String(amount)}`,
    );
  }
  for (const reason of spendDenialReasons) {
    if (!passes[reason](input)) {
      return { allowed: false, reason };
    }
  }
  return { allowed: true };
}

export function availableMicros(job: SpendGuardJob): number {
  const available =
    job.maxSpendMicros - job.settledMicros - job.reservedMicros - job.unresolvedMicros;
  if (available < 0) {
    throw new RangeError(
      `Job books are corrupt: available spend would be negative (${String(available)})`,
    );
  }
  return available;
}
