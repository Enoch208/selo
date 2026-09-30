import { and, eq, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import {
  paymentTransitions,
  spendDelta,
  type PaymentStatus,
  type PaymentTransition,
} from "@selo/core";
import type { Db, Tx } from "../db/client";
import { downstreamPayments, releaseJobs } from "../db/schema";
import { isUniqueViolation } from "./pg-errors";

const txIdConstraint = "downstream_payments_tx_unique";

export type TransitionResult =
  | { readonly applied: true; readonly status: PaymentStatus }
  | { readonly applied: false; readonly current: PaymentStatus }
  | { readonly applied: false; readonly reason: "DUPLICATE_TX" };

export class UnknownPayment extends Error {
  constructor(paymentId: string) {
    super(`Downstream payment ${paymentId} does not exist`);
    this.name = "UnknownPayment";
  }
}

type PaymentChanges = PgUpdateSetSource<typeof downstreamPayments>;

async function currentStatus(tx: Tx, paymentId: string): Promise<PaymentStatus> {
  const [row] = await tx
    .select({ status: downstreamPayments.status })
    .from(downstreamPayments)
    .where(eq(downstreamPayments.id, paymentId));
  if (row === undefined) {
    throw new UnknownPayment(paymentId);
  }
  return row.status;
}

async function applyTransition(
  tx: Tx,
  paymentId: string,
  transition: PaymentTransition,
  changes: PaymentChanges,
): Promise<TransitionResult> {
  const [moved] = await tx
    .update(downstreamPayments)
    .set({ ...changes, status: transition.to })
    .where(
      and(eq(downstreamPayments.id, paymentId), eq(downstreamPayments.status, transition.from)),
    )
    .returning({ jobId: downstreamPayments.jobId, amountMicros: downstreamPayments.amountMicros });
  if (moved === undefined) {
    return { applied: false, current: await currentStatus(tx, paymentId) };
  }
  const delta = spendDelta(transition, moved.amountMicros);
  await tx
    .update(releaseJobs)
    .set({
      reservedSpendMicros: sql`${releaseJobs.reservedSpendMicros} + ${delta.reservedMicros}::bigint`,
      settledSpendMicros: sql`${releaseJobs.settledSpendMicros} + ${delta.settledMicros}::bigint`,
      unresolvedSpendMicros: sql`${releaseJobs.unresolvedSpendMicros} + ${delta.unresolvedMicros}::bigint`,
    })
    .where(eq(releaseJobs.id, moved.jobId));
  return { applied: true, status: transition.to };
}

function transitionPayment(
  db: Db,
  paymentId: string,
  transition: PaymentTransition,
  changes: PaymentChanges,
): Promise<TransitionResult> {
  return db
    .transaction((tx) => applyTransition(tx, paymentId, transition, changes))
    .catch((error: unknown) => {
      if (isUniqueViolation(error, txIdConstraint)) {
        return { applied: false, reason: "DUPLICATE_TX" } as const;
      }
      throw error;
    });
}

export interface SettleInput {
  readonly txId: string;
  readonly requestedAt: Date;
}

export function settleDownstream(
  db: Db,
  paymentId: string,
  input: SettleInput,
): Promise<TransitionResult> {
  return transitionPayment(db, paymentId, paymentTransitions.settle, {
    txId: input.txId,
    requestedAt: input.requestedAt,
    settledAt: sql`now()`,
  });
}

export interface ReleaseInput {
  readonly reason: string;
  readonly requestedAt: Date | null;
}

export function releaseDownstream(
  db: Db,
  paymentId: string,
  input: ReleaseInput,
): Promise<TransitionResult> {
  return transitionPayment(db, paymentId, paymentTransitions.release, {
    resolutionReason: input.reason,
    ...(input.requestedAt === null ? {} : { requestedAt: input.requestedAt }),
  });
}

export interface UnresolvedInput {
  readonly reason: string;
  readonly requestedAt: Date;
}

export function markDownstreamUnresolved(
  db: Db,
  paymentId: string,
  input: UnresolvedInput,
): Promise<TransitionResult> {
  return transitionPayment(db, paymentId, paymentTransitions.markUnresolved, {
    resolutionReason: input.reason,
    requestedAt: input.requestedAt,
  });
}
