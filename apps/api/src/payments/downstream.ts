import { readLimitedText } from "../net/limited-body";
import type { HttpMethod, JsonValue } from "@selo/core";
import type { Network, SchemeNetworkClient } from "@x402/core/types";
import { selectGuardedAccept, type GuardedRequirement } from "./accept-match";
import { httpClientCappedAt, sign, type Signed } from "./sign";
import { readChallenge, readSettlementTxId, type ChallengeRead } from "./challenge-io";
import {
  classifyPaidResponse,
  type AmbiguousOutcome,
  type ReplayHeader,
  type PaidOutcome,
} from "./paid-response";
import {
  discardBody,
  failedBeforeSend,
  messageChain,
  sendBefore,
  transportFailure,
  type BeforeSendFailure,
  type FetchLike,
  type TransportFailure,
} from "./transport";

export { RequirementMismatch } from "./accept-match";
export type { FetchLike } from "./transport";
export type { ReplayHeader, PaidOutcome, AmbiguousOutcome } from "./paid-response";
export type { ExpectedTxId } from "./expected-txid";

export interface DownstreamPayerDeps {
  readonly fetch: FetchLike;
  readonly scheme: SchemeNetworkClient;
  readonly network: Network;
}

interface Exchange {
  readonly url: string;
  readonly method: HttpMethod;
  readonly operationId: string;
  readonly timeoutMs: number;
}

export interface ProbeRequest extends Exchange {
  readonly body?: JsonValue;
}

export type ProbeOutcome =
  | {
      readonly kind: "response";
      readonly status: number;
      readonly contentType: string | null;
      readonly challenge: ChallengeRead;
    }
  | TransportFailure;

export interface PayRequest extends Exchange {
  readonly body?: JsonValue;
  readonly decoded: unknown;
  readonly requirement: GuardedRequirement;
  readonly maxBodyBytes: number;
}

export type PayOutcome =
  { readonly kind: "signing_failed"; readonly message: string } | BeforeSendFailure | PaidOutcome;

const replayBodyCapBytes = 1_048_576;

export interface ReplayRequest extends Exchange {
  readonly replayHeader: ReplayHeader;
}

export type ReplayOutcome =
  | {
      readonly kind: "response";
      readonly status: number;
      readonly txId: string | null;
      readonly settlementHeaderMalformed: boolean;
      readonly bodyText: string | null;
    }
  | TransportFailure;

export interface DownstreamPayer {
  probe(request: ProbeRequest): Promise<ProbeOutcome>;
  pay(request: PayRequest): Promise<PayOutcome>;
  replay(request: ReplayRequest): Promise<ReplayOutcome>;
}

const serialised = (body: JsonValue | undefined): string | null =>
  body === undefined ? null : JSON.stringify(body);

export function createDownstreamPayer(deps: DownstreamPayerDeps): DownstreamPayer {
  const exchange = (request: Exchange, headers: Record<string, string>, body: string | null) => ({
    url: request.url,
    method: request.method,
    headers: { ...headers, "Idempotency-Key": request.operationId },
    body,
  });

  async function probe(request: ProbeRequest): Promise<ProbeOutcome> {
    const deadline = AbortSignal.timeout(request.timeoutMs);
    try {
      const response = await sendBefore(
        deps.fetch,
        exchange(request, {}, serialised(request.body)),
        deadline,
      );
      const challenge = readChallenge(response);
      await discardBody(response);
      const contentType = response.headers.get("content-type");
      return { kind: "response", status: response.status, contentType, challenge };
    } catch (error: unknown) {
      const failure = transportFailure(error, deadline);
      if (failure === null) {
        throw error;
      }
      return failure;
    }
  }

  async function pay(request: PayRequest): Promise<PayOutcome> {
    const selected = selectGuardedAccept(request.decoded, request.requirement, deps.network);
    let signed: Signed;
    try {
      const http = httpClientCappedAt(deps, selected.accept);
      signed = await sign(http, selected, serialised(request.body), request.operationId);
    } catch (error: unknown) {
      return { kind: "signing_failed", message: messageChain(error) };
    }
    const requestedAt = new Date();
    const deadline = AbortSignal.timeout(request.timeoutMs);
    const { replayHeader, expected } = signed;
    try {
      const headers = { [replayHeader.name]: replayHeader.value };
      const outbound = exchange(request, headers, replayHeader.body);
      const response = await sendBefore(deps.fetch, outbound, deadline);
      return await classifyPaidResponse(response, {
        requestedAt,
        replayHeader,
        expected,
        deadline,
        maxBodyBytes: request.maxBodyBytes,
      });
    } catch (error: unknown) {
      const ambiguous: AmbiguousOutcome = {
        kind: "ambiguous",
        requestedAt,
        message: messageChain(error),
        ...expected,
      };
      return failedBeforeSend(error) ?? ambiguous;
    }
  }

  async function replay(request: ReplayRequest): Promise<ReplayOutcome> {
    const deadline = AbortSignal.timeout(request.timeoutMs);
    const { replayHeader } = request;
    const headers = { [replayHeader.name]: replayHeader.value };
    try {
      const outbound = exchange(request, headers, replayHeader.body);
      const response = await sendBefore(deps.fetch, outbound, deadline);
      const settlement = readSettlementTxId(response);
      const read = await readLimitedText(response, replayBodyCapBytes);
      return {
        kind: "response",
        status: response.status,
        txId: settlement.txId,
        settlementHeaderMalformed: settlement.malformed,
        bodyText: read.ok ? read.text : null,
      };
    } catch (error: unknown) {
      const failure = transportFailure(error, deadline);
      if (failure === null) {
        throw error;
      }
      return failure;
    }
  }

  return { probe, pay, replay };
}
