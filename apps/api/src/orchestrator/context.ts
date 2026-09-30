import type { HttpMethod, JsonValue } from "@selo/core";
import type { Db, PreflightRow, ReleaseJobRow } from "../db/client";
import type { Target } from "../net/target";
import type { RunnerDeps } from "./deps";
import { logEvent, type LogFields } from "./log";
import type { ScenarioSet } from "./scenario";
import type { RunState } from "./state";
import type { TargetIo } from "./target-io";

export interface JobContext {
  readonly deps: RunnerDeps;
  readonly db: Db;
  readonly job: ReleaseJobRow;
  readonly preflight: PreflightRow;
  readonly target: Target;
  readonly method: HttpMethod;
  readonly body: JsonValue | undefined;
  readonly signal: AbortSignal;
  readonly scenarios: ScenarioSet;
  readonly io: TargetIo;
  readonly state: RunState;
}

export function log(ctx: JobContext, fields: Omit<LogFields, "jobId" | "targetOrigin">): void {
  logEvent({
    ...fields,
    jobId: ctx.job.id,
    targetOrigin: ctx.target.origin,
    incomingTxId: ctx.job.incomingTxId,
  });
}

export function requestBody(ctx: JobContext): { readonly body?: JsonValue } {
  return ctx.body === undefined ? {} : { body: ctx.body };
}

export function clockExpired(ctx: JobContext): boolean {
  return ctx.signal.aborted;
}
