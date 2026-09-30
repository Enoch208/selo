import {
  formatMicros,
  type AlgorandRequirement,
  type InconclusiveReason,
  type SpendDenialReason,
} from "@selo/core";
import { currentAuthorization } from "../authorizations/store";
import { reserveDownstream } from "../ledger/reserve";
import { RequirementMismatch, type PayOutcome } from "../payments/downstream";
import { clockExpired, log, requestBody, type JobContext } from "./context";
import { maxPaidBodyBytes, paidTimeoutMs } from "./deps";
import { evidenceFor } from "./evidence";
import type { Handshake } from "./handshake";
import { operatorWalletBlocks } from "./operator-wallet";
import { releaseOpen } from "./ledger-moves";
import { applyPayOutcome, concludePaid, type Delivery } from "./paid-outcome";
import { skipScenario } from "./skip";
import type { OpenPayment } from "./state";

const denialOutcome: Readonly<Record<SpendDenialReason, InconclusiveReason>> = {
  AUTHORIZATION_INVALID: "AUTHORIZATION_LAPSED",
  AUTHORIZATION_EXPIRED: "AUTHORIZATION_LAPSED",
  ORIGIN_NOT_AUTHORIZED: "AUTHORIZATION_LAPSED",
  JOB_NOT_RUNNING: "INTERNAL_ERROR",
  NETWORK_NOT_ALLOWED: "INTERNAL_ERROR",
  ASSET_NOT_ALLOWED: "INTERNAL_ERROR",
  PAYMENT_UNRESOLVED: "PAYMENT_UNRESOLVED",
  SCENARIO_BUDGET_EXCEEDED: "BUDGET_EXHAUSTED",
  JOB_BUDGET_EXCEEDED: "BUDGET_EXHAUSTED",
  ABSOLUTE_CAP_EXCEEDED: "BUDGET_EXHAUSTED",
};

async function reserve(ctx: JobContext, requirement: AlgorandRequirement, challengeHash: string) {
  const now = new Date();
  const authorization = await currentAuthorization(ctx.db, ctx.preflight.authorizationId, now);
  return reserveDownstream(ctx.db, {
    jobId: ctx.job.id,
    scenarioId: ctx.scenarios.paid_delivery.id,
    authorization: {
      status: authorization.status,
      origin: authorization.origin,
      expiresAt: authorization.expiresAt,
    },
    payment: {
      origin: ctx.target.origin,
      network: requirement.network,
      asset: requirement.asset,
      amountMicros: requirement.amountMicros,
      payTo: requirement.payTo,
      requirementsHash: challengeHash,
    },
    scenarioMaxSpendMicros: ctx.job.maxSpendMicros,
    absoluteCapMicros: ctx.deps.absoluteCapMicros,
    allowedNetwork: ctx.deps.network.caip2,
    allowedAsset: ctx.deps.network.usdcAssetId,
    now,
  });
}

async function denied(
  ctx: JobContext,
  requirement: AlgorandRequirement,
  reason: SpendDenialReason,
): Promise<Delivery> {
  ctx.state.inconclusive(denialOutcome[reason]);
  const evidenceId = await evidenceFor(ctx, ctx.scenarios.paid_delivery, "downstream_payment", {
    denied: reason,
    amountUsdc: formatMicros(requirement.amountMicros),
    network: requirement.network,
    asset: requirement.asset,
    payTo: requirement.payTo,
    jobMaxSpendUsdc: formatMicros(ctx.job.maxSpendMicros),
  });
  log(ctx, {
    event: "downstream_denied",
    status: reason,
    amountUsdc: formatMicros(requirement.amountMicros),
  });
  await concludePaid(ctx, { kind: "guard_denied", reason }, [evidenceId], null);
  return { kind: "none" };
}

async function notPayable(
  ctx: JobContext,
  open: OpenPayment,
  error: RequirementMismatch,
): Promise<Delivery> {
  await releaseOpen(ctx, open, `nothing signed: ${error.reason}`);
  ctx.state.inconclusive("EVIDENCE_INCOMPLETE");
  const check = ctx.state.record({
    id: "paid_delivery",
    status: "INCONCLUSIVE",
    code: "REQUIREMENT_NOT_PAYABLE",
    blocking: true,
    summary: `The live payment requirement could not be handed to the x402 client (${error.reason}).`,
    evidence: [],
  });
  await ctx.scenarios.paid_delivery.evaluate(check, { mismatch: error.reason });
  return { kind: "none" };
}

async function pay(
  ctx: JobContext,
  handshake: Handshake,
  requirement: AlgorandRequirement,
  open: OpenPayment,
): Promise<Delivery> {
  let outcome: PayOutcome;
  try {
    outcome = await ctx.io.paid.pay({
      url: ctx.target.href,
      method: ctx.method,
      operationId: ctx.scenarios.paid_delivery.operationId,
      timeoutMs: paidTimeoutMs,
      maxBodyBytes: maxPaidBodyBytes,
      decoded: handshake.decoded,
      requirement: {
        network: requirement.network,
        asset: requirement.asset,
        amount: String(requirement.amountMicros),
        payTo: requirement.payTo,
      },
      ...requestBody(ctx),
    });
  } catch (error: unknown) {
    if (error instanceof RequirementMismatch) {
      return notPayable(ctx, open, error);
    }
    throw error;
  }
  return applyPayOutcome(ctx, open, outcome);
}

export async function runPaidDelivery(
  ctx: JobContext,
  handshake: Handshake,
  requirement: AlgorandRequirement,
): Promise<Delivery> {
  const scenario = ctx.scenarios.paid_delivery;
  if (clockExpired(ctx)) {
    await skipScenario(ctx, scenario, "TARGET_TIMEOUT");
    return { kind: "none" };
  }
  if (await operatorWalletBlocks(ctx, requirement)) {
    return { kind: "none" };
  }
  const reservation = await reserve(ctx, requirement, handshake.challengeHash ?? "");
  if (!reservation.reserved) {
    await scenario.advance("POLICY_CHECKED");
    return denied(ctx, requirement, reservation.reason);
  }
  const open: OpenPayment = {
    paymentId: reservation.paymentId,
    amountMicros: requirement.amountMicros,
    requestedAt: new Date(),
  };
  ctx.state.openPayment = open;
  await scenario.advance("POLICY_CHECKED");
  log(ctx, {
    event: "downstream_reserved",
    scenarioId: scenario.id,
    operationId: scenario.operationId,
    amountUsdc: formatMicros(requirement.amountMicros),
  });
  await scenario.advance("RESERVED");
  await scenario.advance("REQUESTING");
  await scenario.attempt();
  return pay(ctx, handshake, requirement, open);
}
