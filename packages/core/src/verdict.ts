import type {
  CheckId,
  CheckResult,
  CheckStatus,
  InconclusiveReason,
  RetryOutcome,
  Verdict,
} from "./contract";
import { checkIds } from "./contract";

export interface VerdictOutcome {
  readonly verdict: Verdict;
  readonly inconclusiveReason: InconclusiveReason | null;
  readonly blockingFailures: readonly CheckId[];
  readonly warnings: readonly string[];
}

function hasEvidence(check: CheckResult): boolean {
  return check.evidence.length > 0;
}

function indexById(checks: readonly CheckResult[]): Map<CheckId, CheckResult> {
  const byId = new Map<CheckId, CheckResult>();
  for (const check of checks) {
    if (byId.has(check.id)) {
      throw new RangeError(`Duplicate check result for ${check.id}`);
    }
    byId.set(check.id, check);
  }
  return byId;
}

function collectWarnings(byId: Map<CheckId, CheckResult>): readonly string[] {
  return checkIds.flatMap((id) => {
    const check = byId.get(id);
    if (check === undefined) {
      return [];
    }
    const isNonBlockingConcern =
      !check.blocking && (check.status === "FAIL" || check.status === "INCONCLUSIVE");
    if (check.status === "WARN" || isNonBlockingConcern) {
      return [`${id}: ${check.summary}`];
    }
    return [];
  });
}

function findProvenFailures(byId: Map<CheckId, CheckResult>): readonly CheckId[] {
  return checkIds.filter((id) => {
    const check = byId.get(id);
    return check !== undefined && check.blocking && check.status === "FAIL" && hasEvidence(check);
  });
}

function hasIncompleteEvidence(byId: Map<CheckId, CheckResult>): boolean {
  return checkIds.some((id) => {
    const check = byId.get(id);
    if (check === undefined) {
      return true;
    }
    if (!check.blocking) {
      return false;
    }
    return check.status === "INCONCLUSIVE" || !hasEvidence(check);
  });
}

export function reduceVerdict(
  checks: readonly CheckResult[],
  abort: InconclusiveReason | null,
): VerdictOutcome {
  const byId = indexById(checks);
  const warnings = collectWarnings(byId);
  const blockingFailures = findProvenFailures(byId);

  if (blockingFailures.length > 0) {
    return { verdict: "FAIL", inconclusiveReason: null, blockingFailures, warnings };
  }

  if (abort !== null) {
    return { verdict: "INCONCLUSIVE", inconclusiveReason: abort, blockingFailures: [], warnings };
  }

  if (hasIncompleteEvidence(byId)) {
    return {
      verdict: "INCONCLUSIVE",
      inconclusiveReason: "EVIDENCE_INCOMPLETE",
      blockingFailures: [],
      warnings,
    };
  }

  return { verdict: "PASS", inconclusiveReason: null, blockingFailures: [], warnings };
}

const retryOutcomeStatuses = {
  PASS_SAFE_RETRY: "PASS",
  PASS_REPLAY_REJECTED: "PASS",
  WARN_NO_IDEMPOTENCY_CONTRACT: "WARN",
  FAIL_DUPLICATE_SIDE_EFFECT: "FAIL",
  INCONCLUSIVE: "INCONCLUSIVE",
} as const satisfies Record<RetryOutcome, CheckStatus>;

export function retryOutcomeStatus(outcome: RetryOutcome): CheckStatus {
  return retryOutcomeStatuses[outcome];
}
