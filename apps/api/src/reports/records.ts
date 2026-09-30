import { asc, eq } from "drizzle-orm";
import type {
  Db,
  DownstreamPaymentRow,
  EvidenceRow,
  PreflightRow,
  ReleaseJobRow,
  ScenarioRow,
  TargetAuthorizationRow,
} from "../db/client";
import {
  downstreamPayments,
  evidence,
  preflights,
  releaseJobs,
  scenarios,
  targetAuthorizations,
} from "../db/schema";

export interface JobRecords {
  readonly job: ReleaseJobRow;
  readonly preflight: PreflightRow;
  readonly authorization: TargetAuthorizationRow;
  readonly scenarios: readonly ScenarioRow[];
  readonly payments: readonly DownstreamPaymentRow[];
  readonly evidence: readonly EvidenceRow[];
}

export class MissingJobRecord extends Error {
  override readonly name = "MissingJobRecord";
}

function present<Row>(row: Row | undefined, what: string): Row {
  if (row === undefined) {
    throw new MissingJobRecord(`${what} is missing`);
  }
  return row;
}

export async function loadJobRecords(db: Db, jobId: string): Promise<JobRecords> {
  const [job] = await db.select().from(releaseJobs).where(eq(releaseJobs.id, jobId));
  const found = present(job, `Release job ${jobId}`);
  const [preflight] = await db
    .select()
    .from(preflights)
    .where(eq(preflights.id, found.preflightId));
  const pinned = present(preflight, `Preflight of job ${jobId}`);
  const [authorization] = await db
    .select()
    .from(targetAuthorizations)
    .where(eq(targetAuthorizations.id, pinned.authorizationId));
  return {
    job: found,
    preflight: pinned,
    authorization: present(authorization, `Authorization of job ${jobId}`),
    scenarios: await db.select().from(scenarios).where(eq(scenarios.jobId, jobId)),
    payments: await db
      .select()
      .from(downstreamPayments)
      .where(eq(downstreamPayments.jobId, jobId))
      .orderBy(asc(downstreamPayments.createdAt)),
    evidence: await db
      .select()
      .from(evidence)
      .where(eq(evidence.jobId, jobId))
      .orderBy(asc(evidence.createdAt)),
  };
}
