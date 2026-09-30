import type { SchemeNetworkClient } from "@x402/core/types";
import { selectGuardedAccept } from "../payments/accept-match";
import { readSettlementTxId } from "../payments/challenge-io";
import { seloNetworks, type SeloNetworkName } from "../payments/networks";
import { httpClientCappedAt, sign, type Signed } from "../payments/sign";
import { messageChain } from "../payments/transport";
import type { ToolFetch } from "./facilitator-client";
import { jsonHeaders, probeChallenge, redirectOf, type ProbedChallenge } from "./pay-probe";
import { paymentDecision } from "./payment-decision";

export interface PayFlowDeps {
  readonly fetch: ToolFetch;
  readonly payer: string;
  readonly seloWallets: readonly string[];
  readonly schemeFor: (network: SeloNetworkName) => SchemeNetworkClient;
  readonly now: () => Date;
  readonly write: (line: string) => void;
}

export interface PayFlowInput {
  readonly api: string;
  readonly preflightId: string;
  readonly expectedStatus: number | null;
  readonly approvedMainnet: boolean;
  readonly expectedPayTo: string | null;
  readonly idempotencyKey: string;
}

export interface RoundTripRecord {
  readonly url: string;
  readonly idempotencyKey: string;
  readonly network: SeloNetworkName;
  readonly payer: string;
  readonly payTo: string;
  readonly price: string;
  readonly tag: string | null;
  readonly unpaidRequestedAt: string;
  readonly paidRequestedAt: string;
  readonly expectedInboundTxId: string | null;
  readonly respondedAt: string | null;
  readonly status: number | null;
  readonly inboundTxId: string | null;
  readonly settlementError: string | null;
  readonly response: unknown;
}

export type PayFlowOutcome =
  | { readonly kind: "refused"; readonly message: string }
  | {
      readonly kind: "unknown";
      readonly message: string;
      readonly record: RoundTripRecord | null;
    }
  | { readonly kind: "completed"; readonly record: RoundTripRecord };

function parseBody(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function readResponse(response: Response): Promise<unknown> {
  try {
    return parseBody(await response.text());
  } catch (error: unknown) {
    return { unreadableBody: messageChain(error) };
  }
}

interface Progress {
  paidRequestSent: boolean;
}

const mayHaveSettled = (pending: string | null): string =>
  `it may have settled. Check the payer account on chain for ${pending ?? "the transfer"}; do not pay again blindly.`;

function requestBody(input: PayFlowInput): string {
  const expected =
    input.expectedStatus === null ? {} : { expected: { status: input.expectedStatus } };
  return JSON.stringify({ preflightId: input.preflightId, profile: "quick", ...expected });
}

function announce(deps: PayFlowDeps, probed: ProbedChallenge): void {
  deps.write(`price    ${probed.price} USDC (asset ${probed.accept.asset})`);
  deps.write(`network  ${probed.accept.network}`);
  deps.write(`payTo    ${probed.accept.payTo}`);
  deps.write(`payer    ${deps.payer}`);
  deps.write(`tag      ${probed.tag ?? "(none)"}`);
}

async function signOnce(
  deps: PayFlowDeps,
  name: SeloNetworkName,
  probed: ProbedChallenge,
  body: string,
  operationId: string,
): Promise<Signed> {
  const network = seloNetworks[name].caip2;
  const { accept } = probed;
  const requirement = { network, asset: accept.asset, amount: accept.amount, payTo: accept.payTo };
  const selected = selectGuardedAccept(probed.decoded, requirement, network);
  const http = httpClientCappedAt(
    { fetch: deps.fetch, scheme: deps.schemeFor(name), network },
    selected.accept,
  );
  return sign(http, selected, body, operationId);
}

async function attempt(
  deps: PayFlowDeps,
  input: PayFlowInput,
  progress: Progress,
): Promise<PayFlowOutcome> {
  const url = new URL("/v1/release-test", input.api).toString();
  const body = requestBody(input);
  const unpaidRequestedAt = deps.now().toISOString();
  const probe = await probeChallenge(deps.fetch, url, body);
  if (!probe.ok) {
    return { kind: "refused", message: probe.message };
  }
  const probed = probe.challenge;
  announce(deps, probed);
  const decision = paymentDecision({
    network: probed.accept.network,
    payer: deps.payer,
    payTo: probed.accept.payTo,
    approvedMainnet: input.approvedMainnet,
    amountMicros: probed.amountMicros,
    expectedPayTo: input.expectedPayTo,
    seloWallets: deps.seloWallets,
  });
  if (decision.kind === "refuse") {
    return { kind: "refused", message: decision.message };
  }
  const signed = await signOnce(deps, decision.network, probed, body, input.idempotencyKey);
  const pending = signed.expected.expectedTxId;
  const base = {
    url,
    idempotencyKey: input.idempotencyKey,
    network: decision.network,
    payer: deps.payer,
    payTo: probed.accept.payTo,
    price: probed.price,
    tag: probed.tag,
    unpaidRequestedAt,
    paidRequestedAt: deps.now().toISOString(),
    expectedInboundTxId: pending,
  };
  const unanswered = { respondedAt: null, inboundTxId: null, settlementError: null };
  let paid: Response;
  try {
    const headers = {
      ...jsonHeaders,
      "Idempotency-Key": input.idempotencyKey,
      [signed.replayHeader.name]: signed.replayHeader.value,
    };
    progress.paidRequestSent = true;
    paid = await deps.fetch(url, { method: "POST", headers, body, redirect: "manual" });
  } catch (error: unknown) {
    const message = `paid request failed in transit (${messageChain(error)}); ${mayHaveSettled(pending)}`;
    return {
      kind: "unknown",
      message,
      record: { ...base, ...unanswered, status: null, response: null },
    };
  }
  const redirected = redirectOf(paid);
  if (redirected !== null) {
    await paid.body?.cancel();
    const message = `paid request: ${redirected}. The signed payment reached ${url} only; ${mayHaveSettled(pending)}`;
    return {
      kind: "unknown",
      message,
      record: { ...base, ...unanswered, status: paid.status, response: null },
    };
  }
  const settlement = readSettlementTxId(paid);
  const response = await readResponse(paid);
  deps.write(`status   ${String(paid.status)}`);
  deps.write(`inbound  ${settlement.txId ?? "(no settlement tx id in PAYMENT-RESPONSE)"}`);
  deps.write(JSON.stringify(response, null, 2));
  const record: RoundTripRecord = {
    ...base,
    respondedAt: deps.now().toISOString(),
    status: paid.status,
    inboundTxId: settlement.txId,
    settlementError: settlement.errorReason,
    response,
  };
  return { kind: "completed", record };
}

export async function runPayment(deps: PayFlowDeps, input: PayFlowInput): Promise<PayFlowOutcome> {
  const progress: Progress = { paidRequestSent: false };
  try {
    return await attempt(deps, input, progress);
  } catch (error: unknown) {
    const reason = messageChain(error);
    return progress.paidRequestSent
      ? {
          kind: "unknown",
          message: `${reason} after the paid request was sent; ${mayHaveSettled(null)}`,
          record: null,
        }
      : { kind: "refused", message: `${reason}; nothing was sent` };
  }
}
