import type { CheckResult, HttpMethod, RetryOutcome } from "../contract";
import { retryOutcomeStatus } from "../verdict";

export type RetryObservation =
  | {
      readonly kind: "response";
      readonly status: number;
      readonly txId: string | null;
      readonly sameBody?: boolean;
    }
  | { readonly kind: "timeout" }
  | { readonly kind: "network_error" }
  | { readonly kind: "not_run" };

export interface EvaluateRetrySafetyInput {
  readonly method: HttpMethod;
  readonly originalTxId: string;
  readonly replay: RetryObservation;
  readonly evidence: readonly string[];
}

export interface RetrySafetyResult {
  readonly check: CheckResult;
  readonly outcome: RetryOutcome;
}

interface Classification {
  readonly outcome: RetryOutcome;
  readonly summary: string;
}

const transientStatuses: ReadonlySet<number> = new Set([408, 429]);

function classifyResponse(
  method: HttpMethod,
  originalTxId: string,
  status: number,
  txId: string | null,
  sameBody: boolean,
): Classification {
  if (transientStatuses.has(status)) {
    return {
      outcome: "INCONCLUSIVE",
      summary: `Replay returned status ${String(status)}, a transient answer that neither rejects nor accepts the replayed payment.`,
    };
  }
  if (status >= 400 && status < 500) {
    return {
      outcome: "PASS_REPLAY_REJECTED",
      summary: `Replaying the identical signed payment header was rejected with status ${String(status)}.`,
    };
  }
  if (status >= 200 && status < 300) {
    if (txId === originalTxId) {
      return {
        outcome: "PASS_SAFE_RETRY",
        summary: `Replay returned ${String(status)} with the same settlement transaction ${originalTxId}, so the replay did not settle twice.`,
      };
    }
    if (txId !== null) {
      return {
        outcome: "FAIL_DUPLICATE_SIDE_EFFECT",
        summary: `Replay returned ${String(status)} with a different transaction id ${txId} than the original ${originalTxId}.`,
      };
    }
    if (sameBody) {
      return {
        outcome: "PASS_SAFE_RETRY",
        summary: `Replay returned ${String(status)} with a body byte-identical to the original paid response and no new settlement, so the target returned its stored result.`,
      };
    }
    if (method === "GET") {
      return {
        outcome: "WARN_NO_IDEMPOTENCY_CONTRACT",
        summary: `Replay of this GET request returned ${String(status)} without a transaction id, so idempotency could not be confirmed.`,
      };
    }
    return {
      outcome: "FAIL_DUPLICATE_SIDE_EFFECT",
      summary: `Replay of this POST request returned ${String(status)} without a transaction id, so a duplicate side effect could not be ruled out.`,
    };
  }
  return {
    outcome: "INCONCLUSIVE",
    summary: `Replay returned status ${String(status)}, which does not establish retry safety either way.`,
  };
}

function classify(input: EvaluateRetrySafetyInput): Classification {
  const { method, originalTxId, replay } = input;
  if (replay.kind === "response") {
    return classifyResponse(
      method,
      originalTxId,
      replay.status,
      replay.txId,
      replay.sameBody === true,
    );
  }
  if (replay.kind === "timeout") {
    return {
      outcome: "INCONCLUSIVE",
      summary: "Replaying the identical signed payment timed out.",
    };
  }
  if (replay.kind === "network_error") {
    return {
      outcome: "INCONCLUSIVE",
      summary: "A network error prevented the replay from completing.",
    };
  }
  return { outcome: "INCONCLUSIVE", summary: "The retry safety check did not run." };
}

export function evaluateRetrySafety(input: EvaluateRetrySafetyInput): RetrySafetyResult {
  const { outcome, summary } = classify(input);
  return {
    check: {
      id: "retry_safety",
      status: retryOutcomeStatus(outcome),
      code: outcome,
      blocking: true,
      summary,
      evidence: input.evidence,
    },
    outcome,
  };
}
