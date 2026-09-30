import { assertJobTransition, type JobStatus } from "@selo/core";
import { and, eq } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import type { Db, ReleaseJobRow } from "../db/client";
import { releaseJobs } from "../db/schema";
import { logEvent } from "./log";

export type JobChanges = Omit<PgUpdateSetSource<typeof releaseJobs>, "status">;

export class JobNotRunnable extends Error {
  override readonly name = "JobNotRunnable";

  constructor(jobId: string, status: JobStatus | null) {
    super(`Release job ${jobId} is ${status ?? "missing"}, not INBOUND_SETTLED; it will not run`);
  }
}

export class JobMovedUnderneath extends Error {
  override readonly name = "JobMovedUnderneath";
}

export async function currentJob(db: Db, jobId: string): Promise<ReleaseJobRow | undefined> {
  const [row] = await db.select().from(releaseJobs).where(eq(releaseJobs.id, jobId));
  return row;
}

async function applyMove(
  db: Db,
  jobId: string,
  from: JobStatus,
  to: JobStatus,
  changes: JobChanges,
): Promise<ReleaseJobRow | undefined> {
  assertJobTransition(from, to);
  const [row] = await db
    .update(releaseJobs)
    .set({ ...changes, status: to })
    .where(and(eq(releaseJobs.id, jobId), eq(releaseJobs.status, from)))
    .returning();
  if (row !== undefined) {
    logEvent({ event: "job_transition", jobId, status: to, incomingTxId: row.incomingTxId });
  }
  return row;
}

export async function moveJob(
  db: Db,
  jobId: string,
  from: JobStatus,
  to: JobStatus,
  changes: JobChanges = {},
): Promise<void> {
  if ((await applyMove(db, jobId, from, to, changes)) === undefined) {
    throw new JobMovedUnderneath(`Release job ${jobId} left ${from} before moving to ${to}`);
  }
}

export async function claimForRun(db: Db, jobId: string): Promise<ReleaseJobRow> {
  const job = await currentJob(db, jobId);
  if (job?.status !== "INBOUND_SETTLED" || job.incomingSettledAt === null) {
    throw new JobNotRunnable(jobId, job?.status ?? null);
  }
  const claimed = await applyMove(db, jobId, "INBOUND_SETTLED", "QUEUED", {});
  if (claimed === undefined) {
    throw new JobNotRunnable(jobId, (await currentJob(db, jobId))?.status ?? null);
  }
  return claimed;
}
