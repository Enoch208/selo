import type { TargetRejection } from "./target";

export type SafeFetchBlockReason =
  TargetRejection | "ORIGIN_NOT_ALLOWED" | "TOO_MANY_REDIRECTS" | "REDIRECT_NOT_ALLOWED";

export type SafeFetchFailure =
  | { readonly kind: "blocked"; readonly reason: SafeFetchBlockReason }
  | { readonly kind: "timeout" }
  | { readonly kind: "network" };

function describeFailure(failure: SafeFetchFailure): string {
  return failure.kind === "blocked" ? `blocked: ${failure.reason}` : failure.kind;
}

export class SafeFetchError extends Error {
  override readonly name = "SafeFetchError";
  readonly failure: SafeFetchFailure;
  readonly afterDispatch: boolean;

  constructor(failure: SafeFetchFailure, cause?: unknown, afterDispatch = true) {
    super(`safe fetch ${describeFailure(failure)}`, cause === undefined ? undefined : { cause });
    this.failure = failure;
    this.afterDispatch = afterDispatch;
  }
}

export const blocked = (reason: SafeFetchBlockReason, cause?: unknown): SafeFetchError =>
  new SafeFetchError({ kind: "blocked", reason }, cause, false);

export interface AbortSources {
  readonly timeout: AbortSignal;
  readonly caller: AbortSignal;
}

const isTimeoutReason = (reason: unknown): boolean =>
  reason instanceof DOMException && reason.name === "TimeoutError";

export function classifyFailure(
  error: unknown,
  sources: AbortSources,
  dispatched: boolean,
): unknown {
  if (error instanceof SafeFetchError) {
    const afterDispatch = dispatched || error.afterDispatch;
    return afterDispatch === error.afterDispatch
      ? error
      : new SafeFetchError(error.failure, error.cause, afterDispatch);
  }
  if (sources.timeout.aborted) {
    return new SafeFetchError({ kind: "timeout" }, error, dispatched);
  }
  if (sources.caller.aborted) {
    const reason: unknown = sources.caller.reason;
    return isTimeoutReason(reason)
      ? new SafeFetchError({ kind: "timeout" }, reason, dispatched)
      : reason;
  }
  return new SafeFetchError({ kind: "network" }, error, dispatched);
}
