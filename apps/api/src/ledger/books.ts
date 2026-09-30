import { eq, sql } from "drizzle-orm";
import type { PaymentStatus } from "@selo/core";
import type { Executor } from "../db/client";
import { downstreamPayments, releaseJobs } from "../db/schema";

export interface SpendCounters {
  readonly settled: number;
  readonly reserved: number;
  readonly unresolved: number;
}

export interface JobBooks {
  readonly maxSpendMicros: number;
  readonly counters: SpendCounters;
  readonly sums: SpendCounters & { readonly released: number };
}

export class UnknownJob extends Error {
  constructor(jobId: string) {
    super(`Release job ${jobId} does not exist`);
    this.name = "UnknownJob";
  }
}

export async function jobBooks(db: Executor, jobId: string): Promise<JobBooks> {
  const [job] = await db.select().from(releaseJobs).where(eq(releaseJobs.id, jobId));
  if (job === undefined) {
    throw new UnknownJob(jobId);
  }
  const rows = await db
    .select({
      status: downstreamPayments.status,
      total: sql<string>`sum(${downstreamPayments.amountMicros})`,
    })
    .from(downstreamPayments)
    .where(eq(downstreamPayments.jobId, jobId))
    .groupBy(downstreamPayments.status);
  const sumOf = (status: PaymentStatus): number =>
    Number(rows.find((row) => row.status === status)?.total ?? 0);
  return {
    maxSpendMicros: job.maxSpendMicros,
    counters: {
      settled: job.settledSpendMicros,
      reserved: job.reservedSpendMicros,
      unresolved: job.unresolvedSpendMicros,
    },
    sums: {
      settled: sumOf("SETTLED"),
      reserved: sumOf("RESERVED"),
      unresolved: sumOf("UNRESOLVED"),
      released: sumOf("RELEASED"),
    },
  };
}
