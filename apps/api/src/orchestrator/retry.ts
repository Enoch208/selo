import { evaluateRetrySafety, type RetryObservation } from "@selo/core";
import type { ReplayOutcome } from "../payments/downstream";
import { clockExpired, type JobContext } from "./context";
import { paidTimeoutMs } from "./deps";
import { evidenceFor } from "./evidence";
import { sha256Hex } from "../evidence/canonical";
import { alert } from "./log";
import type { Delivery } from "./paid-outcome";
import { recheckAuthorization } from "./recheck";
import { skipScenario } from "./skip";

function sameBodyAs(original: string | null, outcome: ReplayOutcome): boolean | null {
  if (outcome.kind !== "response" || original === null || outcome.bodyText === null) {
    return null;
  }
  return outcome.bodyText === original;
}

function observationOf(outcome: ReplayOutcome, sameBody: boolean | null): RetryObservation {
  if (outcome.kind === "response") {
    const base = { kind: "response" as const, status: outcome.status, txId: outcome.txId };
    return sameBody === null ? base : { ...base, sameBody };
  }
  return outcome.kind === "timeout" ? { kind: "timeout" } : { kind: "network_error" };
}

export async function runRetry(ctx: JobContext, delivery: Delivery): Promise<void> {
  const scenario = ctx.scenarios.retry_safety;
  if (clockExpired(ctx)) {
    await skipScenario(ctx, scenario, "TARGET_TIMEOUT");
    return;
  }
  if (delivery.kind !== "response" || delivery.settledTxId === null || ctx.state.stopSpending) {
    await skipScenario(ctx, scenario, null);
    return;
  }
  if (!(await recheckAuthorization(ctx, "before_replay", scenario))) {
    await skipScenario(ctx, scenario, "AUTHORIZATION_LAPSED");
    return;
  }
  const originalTxId = delivery.settledTxId;
  const idempotencyKey = ctx.scenarios.paid_delivery.operationId;
  await scenario.advance("POLICY_CHECKED");
  await scenario.advance("REQUESTING");
  await scenario.attempt();
  const outcome = await ctx.io.paid.replay({
    url: ctx.target.href,
    method: ctx.method,
    operationId: idempotencyKey,
    timeoutMs: paidTimeoutMs,
    replayHeader: delivery.response.replayHeader,
  });
  const sameBody = sameBodyAs(delivery.response.bodyText, outcome);
  const replay = observationOf(outcome, sameBody);
  if (replay.kind === "response" && replay.txId !== null && replay.txId !== originalTxId) {
    alert("replay_second_settlement", ctx.job.id, { originalTxId, replayTxId: replay.txId });
  }
  if (replay.kind === "timeout") {
    ctx.state.inconclusive("TARGET_TIMEOUT");
  }
  if (replay.kind === "network_error") {
    ctx.state.inconclusive("NETWORK_UNAVAILABLE");
  }
  const evidenceId = await evidenceFor(ctx, scenario, "replay_response", {
    idempotencyKey,
    originalTxId,
    outcome: outcome.kind,
    status: outcome.kind === "response" ? outcome.status : null,
    txId: outcome.kind === "response" ? outcome.txId : null,
    settlementHeaderMalformed:
      outcome.kind === "response" ? outcome.settlementHeaderMalformed : null,
    headers: ctx.io.lastHeaders(),
    bodySha256:
      outcome.kind === "response" && outcome.bodyText !== null ? sha256Hex(outcome.bodyText) : null,
    bodyBytes:
      outcome.kind === "response" && outcome.bodyText !== null
        ? Buffer.byteLength(outcome.bodyText)
        : null,
    sameBodyAsPaidResponse: sameBody,
  });
  const result = evaluateRetrySafety({ method: ctx.method, originalTxId, replay, evidence: [] });
  const check = ctx.state.record({ ...result.check, evidence: [evidenceId] });
  await scenario.evaluate(check, replay);
}
