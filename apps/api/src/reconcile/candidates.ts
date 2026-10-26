import type { JobStatus } from "@selo/core";
import { asc, count, eq } from "drizzle-orm";
import type { Db } from "../db/client";
import { downstreamPayments, releaseJobs } from "../db/schema";

export interface UnresolvedPayment {
  readonly paymentId: string;
  readonly jobId: string;
  readonly jobStatus: JobStatus;
  readonly network: string;
  readonly assetId: string;
  readonly payTo: string;
  readonly amountMicros: number;
  readonly txId: string | null;
  readonly expectedTxId: string | null;
  readonly lastValidRound: number | null;
}

export function unresolvedPayments(db: Db, limit: number): Promise<UnresolvedPayment[]> {
  return db
    .select({
      paymentId: downstreamPayments.id,
      jobId: downstreamPayments.jobId,
      jobStatus: releaseJobs.status,
      network: downstreamPayments.network,
      assetId: downstreamPayments.assetId,
      payTo: downstreamPayments.payTo,
      amountMicros: downstreamPayments.amountMicros,
      txId: downstreamPayments.txId,
      expectedTxId: downstreamPayments.expectedTxId,
      lastValidRound: downstreamPayments.lastValidRound,
    })
    .from(downstreamPayments)
    .innerJoin(releaseJobs, eq(downstreamPayments.jobId, releaseJobs.id))
    .where(eq(downstreamPayments.status, "UNRESOLVED"))
    .orderBy(asc(downstreamPayments.createdAt), asc(downstreamPayments.id))
    .limit(limit);
}

export async function unresolvedCount(db: Db): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(downstreamPayments)
    .where(eq(downstreamPayments.status, "UNRESOLVED"));
  return row?.total ?? 0;
}
