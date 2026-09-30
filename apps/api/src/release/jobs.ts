import {
  assertJobTransition,
  isLegalJobTransition,
  type ExpectedContract,
  type InconclusiveReason,
} from "@selo/core";
import { and, eq, sql } from "drizzle-orm";
import type { Db, ReleaseJobRow } from "../db/client";
import { releaseJobs } from "../db/schema";
import { newId } from "../ids";

export interface JobClaim {
  readonly preflightId: string;
  readonly idempotencyKey: string;
  readonly maxSpendMicros: number;
  readonly expected: ExpectedContract | null;
  readonly gitSha: string | null;
}

export type ClaimOutcome =
  | { readonly kind: "claimed"; readonly jobId: string }
  | { readonly kind: "duplicate"; readonly job: ReleaseJobRow | undefined };

export interface InboundSettlement {
  readonly txId: string;
  readonly payer: string | null;
  readonly amountMicros: number;
}

export type SettledOutcome =
  | { readonly kind: "settled" }
  | { readonly kind: "tx_already_used"; readonly job: ReleaseJobRow | undefined };

const incomingTxConstraint = "release_jobs_incoming_tx_id_unique";

export async function findJob(db: Db, jobId: string): Promise<ReleaseJobRow | undefined> {
  const [row] = await db.select().from(releaseJobs).where(eq(releaseJobs.id, jobId));
  return row;
}

export async function claimJob(db: Db, claim: JobClaim): Promise<ClaimOutcome> {
  const [claimed] = await db
    .insert(releaseJobs)
    .values({
      id: newId("job"),
      preflightId: claim.preflightId,
      profile: "quick",
      status: "READY",
      idempotencyKey: claim.idempotencyKey,
      maxSpendMicros: claim.maxSpendMicros,
      expectedJson: claim.expected,
      gitSha: claim.gitSha,
    })
    .onConflictDoNothing({ target: releaseJobs.idempotencyKey })
    .returning({ id: releaseJobs.id });
  if (claimed !== undefined) {
    return { kind: "claimed", jobId: claimed.id };
  }
  const [existing] = await db
    .select()
    .from(releaseJobs)
    .where(eq(releaseJobs.idempotencyKey, claim.idempotencyKey));
  return { kind: "duplicate", job: existing };
}

function violates(error: unknown, constraint: string): boolean {
  const cause: unknown = error instanceof Error ? error.cause : undefined;
  return (
    typeof cause === "object" &&
    cause !== null &&
    "constraint_name" in cause &&
    cause.constraint_name === constraint
  );
}

export async function recordInboundSettlement(
  db: Db,
  jobId: string,
  settlement: InboundSettlement,
): Promise<SettledOutcome> {
  assertJobTransition("READY", "INBOUND_SETTLED");
  try {
    const [updated] = await db
      .update(releaseJobs)
      .set({
        status: "INBOUND_SETTLED",
        incomingTxId: settlement.txId,
        payer: settlement.payer,
        incomingAmountMicros: settlement.amountMicros,
        incomingSettledAt: sql`clock_timestamp()`,
      })
      .where(and(eq(releaseJobs.id, jobId), eq(releaseJobs.status, "READY")))
      .returning({ id: releaseJobs.id });
    if (updated === undefined) {
      throw new Error(`Job ${jobId} left READY before its inbound settlement was recorded`);
    }
    return { kind: "settled" };
  } catch (error: unknown) {
    if (!violates(error, incomingTxConstraint)) {
      throw error;
    }
    await discardUnsettledJob(db, jobId);
    const [holder] = await db
      .select()
      .from(releaseJobs)
      .where(eq(releaseJobs.incomingTxId, settlement.txId));
    return { kind: "tx_already_used", job: holder };
  }
}

export async function discardUnsettledJob(db: Db, jobId: string): Promise<void> {
  await db
    .delete(releaseJobs)
    .where(and(eq(releaseJobs.id, jobId), eq(releaseJobs.status, "READY")));
}

export async function markInconclusive(
  db: Db,
  jobId: string,
  reason: InconclusiveReason,
): Promise<boolean> {
  const job = await findJob(db, jobId);
  if (job === undefined || !isLegalJobTransition(job.status, "INCONCLUSIVE")) {
    return false;
  }
  const moved = await db
    .update(releaseJobs)
    .set({
      status: "INCONCLUSIVE",
      inconclusiveReason: reason,
      completedAt: sql`clock_timestamp()`,
    })
    .where(and(eq(releaseJobs.id, jobId), eq(releaseJobs.status, job.status)))
    .returning({ id: releaseJobs.id });
  return moved.length > 0;
}

export type UnresolvedOutcome = "held_with_tx" | "held_without_tx" | "tx_already_held";

export async function markUnresolved(
  db: Db,
  jobId: string,
  txId: string | null,
): Promise<UnresolvedOutcome> {
  assertJobTransition("READY", "INCONCLUSIVE");
  const hold = (incomingTxId: string | null) =>
    db
      .update(releaseJobs)
      .set({
        status: "INCONCLUSIVE",
        inconclusiveReason: "FACILITATOR_UNAVAILABLE",
        completedAt: sql`clock_timestamp()`,
        incomingTxId,
      })
      .where(and(eq(releaseJobs.id, jobId), eq(releaseJobs.status, "READY")));
  if (txId === null || txId === "") {
    await hold(null);
    return "held_without_tx";
  }
  try {
    await hold(txId);
    return "held_with_tx";
  } catch (error: unknown) {
    if (!violates(error, incomingTxConstraint)) {
      throw error;
    }
    await hold(null);
    return "tx_already_held";
  }
}
