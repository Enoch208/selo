import type { ApiError, InconclusiveReason, JobStatus } from "@selo/core";
import type { HTTPResponseInstructions } from "@x402/core/server";
import type { ReleaseJobRow } from "../db/client";
import type { ReleaseRunner } from "./deps";

export type JobError = ApiError & { readonly jobId: string };

export function instructionsResponse(instructions: HTTPResponseInstructions): Response {
  const body = instructions.body ?? {};
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status: instructions.status,
    headers: instructions.headers,
  });
}

export function jsonResponse(
  status: number,
  body: unknown,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

export function jobError(
  status: number,
  error: string,
  message: string,
  jobId: string,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return jsonResponse(status, { error, message, jobId } satisfies JobError, headers);
}

export function unresolvedInbound(jobId: string, txId: string | null): Response {
  return jsonResponse(502, {
    error: "INBOUND_SETTLEMENT_UNRESOLVED",
    message:
      "The facilitator did not confirm the outcome of your payment; the job is held for reconciliation and will not run. Do not pay again for this request.",
    jobId,
    txId,
  } satisfies JobError & { readonly txId: string | null });
}

const unfinishedStatuses: readonly JobStatus[] = [
  "READY",
  "INBOUND_SETTLED",
  "QUEUED",
  "RUNNING_PREFLIGHT_RECHECK",
  "RUNNING",
  "ANALYZING",
];

function isHeldUnresolved(job: ReleaseJobRow): boolean {
  return (
    job.status === "INCONCLUSIVE" &&
    job.inconclusiveReason === "FACILITATOR_UNAVAILABLE" &&
    job.incomingSettledAt === null
  );
}

function terminalJob(job: ReleaseJobRow): Response {
  return jsonResponse(409, {
    error: "JOB_TERMINAL",
    message: "This release test already finished without a report; start a new preflight to retest",
    jobId: job.id,
    status: job.status,
    inconclusiveReason: job.inconclusiveReason,
  } satisfies JobError & {
    readonly status: JobStatus;
    readonly inconclusiveReason: InconclusiveReason | null;
  });
}

export async function replyForExisting(
  runner: ReleaseRunner,
  job: ReleaseJobRow | undefined,
): Promise<Response> {
  if (job === undefined) {
    return jsonResponse(409, {
      error: "JOB_IN_PROGRESS",
      message: "A request with the same idempotency key is being resolved; retry shortly",
    } satisfies ApiError);
  }
  if (isHeldUnresolved(job)) {
    return unresolvedInbound(job.id, job.incomingTxId);
  }
  if (job.status !== "REPORT_WRITTEN" && !unfinishedStatuses.includes(job.status)) {
    return terminalJob(job);
  }
  const report = job.status === "REPORT_WRITTEN" ? await runner.result(job.id) : null;
  if (report !== null) {
    return jsonResponse(200, report);
  }
  return jobError(
    409,
    "JOB_IN_PROGRESS",
    "A release test for this request is already running; retry to fetch its result",
    job.id,
  );
}
