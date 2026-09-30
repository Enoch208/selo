import { parseAtomicUnits, type InconclusiveReason } from "@selo/core";
import type {
  CompletedSettlement,
  HTTPRequestContext,
  ProcessSettleFailureResponse,
  ProcessSettleResultResponse,
  ProcessSettleSuccessResponse,
} from "@x402/core/server";
import type { PaymentPayload, PaymentRequirements } from "@x402/core/types";
import type { Db } from "../db/client";
import {
  InboundSettlementUnresolved,
  settlementPendingReason,
  type InboundGate,
} from "../payments/inbound";
import type { ReleaseDeps } from "./deps";
import {
  discardUnsettledJob,
  markInconclusive,
  markUnresolved,
  recordInboundSettlement,
  type InboundSettlement,
  type SettledOutcome,
} from "./jobs";
import { alert, describeError } from "../orchestrator/log";
import {
  instructionsResponse,
  jobError,
  jsonResponse,
  replyForExisting,
  unresolvedInbound,
} from "./replies";

export interface VerifiedInbound {
  readonly paymentPayload: PaymentPayload;
  readonly paymentRequirements: PaymentRequirements;
  readonly declaredExtensions?: Record<string, unknown>;
  readonly beforeHandlerSettlement?: CompletedSettlement;
}

type SettleAttempt =
  | { readonly kind: "answered"; readonly settlement: ProcessSettleResultResponse }
  | { readonly kind: "threw"; readonly error: unknown };

async function settle(
  gate: InboundGate,
  verified: VerifiedInbound,
  request: HTTPRequestContext,
): Promise<SettleAttempt> {
  try {
    const settlement = await gate.processSettlement(
      verified.paymentPayload,
      verified.paymentRequirements,
      verified.declaredExtensions,
      { request },
      undefined,
      verified.beforeHandlerSettlement,
    );
    return { kind: "answered", settlement };
  } catch (error: unknown) {
    return { kind: "threw", error };
  }
}

async function bestEffortInconclusive(
  db: Db,
  jobId: string,
  reason: InconclusiveReason,
): Promise<boolean> {
  try {
    if (await markInconclusive(db, jobId, reason)) {
      return true;
    }
    alert("job_mark_inconclusive_failed", jobId, {
      reason,
      cause: "job was not in a markable state",
    });
  } catch (error: unknown) {
    alert("job_mark_inconclusive_failed", jobId, { reason, cause: describeError(error) });
  }
  return false;
}

async function holdUnresolved(
  db: Db,
  jobId: string,
  txId: string | null,
  cause: unknown,
): Promise<Response> {
  alert("inbound_settlement_unresolved", jobId, { txId, cause: describeError(cause) });
  try {
    const held = await markUnresolved(db, jobId, txId);
    if (held === "tx_already_held") {
      alert("inbound_unresolved_tx_already_held", jobId, { txId, cause: describeError(cause) });
    }
  } catch (error: unknown) {
    alert("inbound_hold_failed", jobId, { txId, cause: describeError(error) });
  }
  return unresolvedInbound(jobId, txId);
}

function describeFailure(failure: ProcessSettleFailureResponse): string {
  const detail = failure.errorMessage;
  return detail === undefined || detail === failure.errorReason
    ? failure.errorReason
    : `${failure.errorReason}: ${detail}`;
}

function unresolvedTxOf(error: unknown): string | null {
  return error instanceof InboundSettlementUnresolved ? error.transaction : null;
}

function mayStillLand(failure: ProcessSettleFailureResponse): boolean {
  return failure.errorReason === settlementPendingReason || failure.transaction !== "";
}

async function recordOrAlert(
  db: Db,
  jobId: string,
  settlement: ProcessSettleSuccessResponse,
  inbound: InboundSettlement,
): Promise<SettledOutcome | Response> {
  try {
    return await recordInboundSettlement(db, jobId, inbound);
  } catch (error: unknown) {
    alert("inbound_settled_not_recorded", jobId, {
      txId: inbound.txId,
      payer: inbound.payer,
      amountMicros: inbound.amountMicros,
      cause: describeError(error),
    });
    await bestEffortInconclusive(db, jobId, "INTERNAL_ERROR");
    return jobError(
      500,
      "INBOUND_RECORD_FAILED",
      "Your payment settled but Selo could not record it; the job will not run and is flagged for reconciliation",
      jobId,
      settlement.headers,
    );
  }
}

export async function settleThenRun(
  db: Db,
  deps: ReleaseDeps,
  jobId: string,
  verified: VerifiedInbound,
  request: HTTPRequestContext,
): Promise<Response> {
  const attempt = await settle(deps.gate, verified, request);
  if (attempt.kind === "threw") {
    return holdUnresolved(db, jobId, unresolvedTxOf(attempt.error), attempt.error);
  }
  const { settlement } = attempt;
  if (!settlement.success) {
    if (mayStillLand(settlement)) {
      const txId = settlement.transaction === "" ? null : settlement.transaction;
      return holdUnresolved(db, jobId, txId, describeFailure(settlement));
    }
    await discardUnsettledJob(db, jobId);
    return instructionsResponse(settlement.response);
  }
  const amountMicros = parseAtomicUnits(settlement.amount ?? settlement.requirements.amount);
  if (settlement.transaction === "" || amountMicros === null) {
    const txId = settlement.transaction === "" ? null : settlement.transaction;
    return holdUnresolved(db, jobId, txId, "settlement success without a transaction and amount");
  }
  const recorded = await recordOrAlert(db, jobId, settlement, {
    txId: settlement.transaction,
    payer: settlement.payer ?? null,
    amountMicros,
  });
  if (recorded instanceof Response) {
    return recorded;
  }
  if (recorded.kind === "tx_already_used") {
    return replyForExisting(deps.runner, recorded.job);
  }
  try {
    return jsonResponse(200, await deps.runner.run(jobId), settlement.headers);
  } catch (error: unknown) {
    alert("runner_failed_after_settlement", jobId, { cause: describeError(error) });
    const marked = await bestEffortInconclusive(db, jobId, "INTERNAL_ERROR");
    return jobError(
      500,
      "INTERNAL",
      marked
        ? "Selo failed after settling your payment; the job is recorded as INCONCLUSIVE"
        : "Selo failed after settling your payment and could not record the job's outcome; it is flagged for reconciliation",
      jobId,
      settlement.headers,
    );
  }
}
