import type { ReleaseTestResponse } from "@selo/core";
import type { PayFlowOutcome } from "@selo/api/pay-flow";
import { exitCodes, type ExitCode } from "./exit";
import { decideGate, parseReport, type Gate } from "./gate";
import { errorCode, errorText } from "./http";
import type { RunPhase } from "./state";

export interface Conclusion {
  readonly gate: Gate;
  readonly exitCode: ExitCode;
  readonly phase: RunPhase;
  readonly reason: string;
  readonly report: ReleaseTestResponse | null;
  readonly expectedInboundTxId: string | null;
}

const notCharged = "nothing was charged";

function blocked(
  exitCode: ExitCode,
  phase: RunPhase,
  reason: string,
  expectedInboundTxId: string | null,
): Conclusion {
  return { gate: "BLOCK", exitCode, phase, reason, report: null, expectedInboundTxId };
}

function concludeReport(body: unknown, expectedInboundTxId: string | null): Conclusion {
  const parsed = parseReport(body);
  if (!parsed.ok) {
    return blocked(exitCodes.inconclusive, "concluded", parsed.issue, expectedInboundTxId);
  }
  const decision = decideGate(parsed.report);
  return { ...decision, phase: "concluded", report: parsed.report, expectedInboundTxId };
}

function concludeAnswer(
  status: number,
  body: unknown,
  resuming: boolean,
  expectedInboundTxId: string | null,
): Conclusion {
  const code = errorCode(body);
  const said = `HTTP ${String(status)} ${errorText(body)}`;
  const unchargedPhase: RunPhase = resuming ? "unresolved" : "rejected";
  if (status === 200) {
    return concludeReport(body, expectedInboundTxId);
  }
  if (status === 402) {
    return blocked(
      exitCodes.refused,
      unchargedPhase,
      `Selo did not accept the payment, ${notCharged}: ${said}`,
      expectedInboundTxId,
    );
  }
  if (code === "JOB_IN_PROGRESS") {
    return blocked(
      exitCodes.inconclusive,
      "unresolved",
      `the release test is still running; resume later: ${said}`,
      expectedInboundTxId,
    );
  }
  if (code === "JOB_TERMINAL") {
    return blocked(
      exitCodes.inconclusive,
      "concluded",
      `the release test finished without a report: ${said}`,
      expectedInboundTxId,
    );
  }
  if (code === "FACILITATOR_UNAVAILABLE") {
    return blocked(
      exitCodes.inconclusive,
      unchargedPhase,
      `the facilitator could not verify the payment, ${notCharged}: ${said}`,
      expectedInboundTxId,
    );
  }
  if (status >= 400 && status < 500) {
    const exitCode = resuming ? exitCodes.inconclusive : exitCodes.refused;
    return blocked(
      exitCode,
      unchargedPhase,
      `Selo refused the release test: ${said}`,
      expectedInboundTxId,
    );
  }
  return blocked(
    exitCodes.inconclusive,
    "unresolved",
    `the payment outcome is not confirmed; do not pay again blindly: ${said}`,
    expectedInboundTxId,
  );
}

export function conclude(outcome: PayFlowOutcome, resuming: boolean): Conclusion {
  if (outcome.kind === "refused") {
    const exitCode =
      outcome.cause === "unreachable" || resuming ? exitCodes.inconclusive : exitCodes.refused;
    return blocked(exitCode, resuming ? "unresolved" : "rejected", outcome.message, null);
  }
  if (outcome.kind === "unknown") {
    return blocked(
      exitCodes.inconclusive,
      "unresolved",
      outcome.message,
      outcome.record?.expectedInboundTxId ?? null,
    );
  }
  const { record } = outcome;
  return concludeAnswer(record.status ?? 0, record.response, resuming, record.expectedInboundTxId);
}
