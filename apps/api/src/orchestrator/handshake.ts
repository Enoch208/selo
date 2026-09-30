import {
  evaluateHandshake,
  type AlgorandRequirement,
  type CheckResult,
  type InconclusiveReason,
} from "@selo/core";
import algosdk from "algosdk";
import { canonicalJson, sha256Hex } from "../evidence/canonical";
import type { ProbeOutcome } from "../payments/downstream";
import type { TransportFailure } from "../payments/transport";
import { requestBody, type JobContext } from "./context";
import { handshakeTimeoutMs } from "./deps";
import { evidenceFor } from "./evidence";

export interface Handshake {
  readonly check: CheckResult;
  readonly requirement: AlgorandRequirement | null;
  readonly decoded: unknown;
  readonly challengeHash: string | null;
}

const transportCodes: Readonly<
  Record<TransportFailure["kind"], { readonly code: string; readonly reason: InconclusiveReason }>
> = {
  timeout: { code: "TARGET_TIMEOUT", reason: "TARGET_TIMEOUT" },
  network_error: { code: "NETWORK_UNAVAILABLE", reason: "NETWORK_UNAVAILABLE" },
  blocked: { code: "TARGET_BLOCKED", reason: "NETWORK_UNAVAILABLE" },
};

function unreachable(ctx: JobContext, failure: TransportFailure): Handshake {
  const { code, reason } = transportCodes[failure.kind];
  ctx.state.inconclusive(reason);
  return {
    check: {
      id: "handshake",
      status: "INCONCLUSIVE",
      code,
      blocking: true,
      summary: `The unpaid request to the target did not complete (${failure.kind}).`,
      evidence: [],
    },
    requirement: null,
    decoded: null,
    challengeHash: null,
  };
}

function observed(ctx: JobContext, outcome: ProbeOutcome, challengeHash: string | null): unknown {
  if (outcome.kind !== "response") {
    return { failure: outcome };
  }
  const { challenge } = outcome;
  return {
    status: outcome.status,
    contentType: outcome.contentType,
    headers: ctx.io.lastHeaders(),
    decoded: challenge.decoded,
    decodeFailed: challenge.decodeFailed,
    decodeError: challenge.decodeError,
    challengeSha256: challengeHash,
  };
}

function evaluated(ctx: JobContext, outcome: ProbeOutcome): Handshake {
  if (outcome.kind !== "response") {
    return unreachable(ctx, outcome);
  }
  const { challenge } = outcome;
  const result = evaluateHandshake({
    status: challenge.status,
    decoded: challenge.decoded,
    decodeFailed: challenge.decodeFailed,
    policy: { network: ctx.deps.network.caip2, asset: ctx.deps.network.usdcAssetId },
    isValidPayTo: (address) => algosdk.isValidAddress(address),
    evidence: [],
  });
  const challengeHash =
    challenge.decoded === null ? null : sha256Hex(canonicalJson(challenge.decoded));
  return { ...result, decoded: challenge.decoded, challengeHash };
}

export async function runHandshake(ctx: JobContext): Promise<Handshake> {
  const scenario = ctx.scenarios.handshake;
  await scenario.advance("POLICY_CHECKED");
  await scenario.advance("REQUESTING");
  await scenario.attempt();
  const outcome = await ctx.io.probe.probe({
    url: ctx.target.href,
    method: ctx.method,
    operationId: scenario.operationId,
    timeoutMs: handshakeTimeoutMs,
    ...requestBody(ctx),
  });
  const handshake = evaluated(ctx, outcome);
  const evidenceId = await evidenceFor(
    ctx,
    scenario,
    "target_challenge",
    observed(ctx, outcome, handshake.challengeHash),
  );
  const check = ctx.state.record({ ...handshake.check, evidence: [evidenceId] });
  await scenario.evaluate(check, { probe: outcome.kind });
  return { ...handshake, check };
}
