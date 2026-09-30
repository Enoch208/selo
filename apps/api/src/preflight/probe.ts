import type { HttpMethod, JsonValue } from "@selo/core";
import { readChallenge, type ChallengeRead } from "../payments/challenge-io";
import {
  discardBody,
  sendBefore,
  transportFailure,
  type FetchLike,
  type TransportFailure,
} from "../payments/transport";
import { probeTimeoutMs } from "./deps";

export interface ProbeTargetRequest {
  readonly url: string;
  readonly method: HttpMethod;
  readonly operationId: string;
  readonly body?: JsonValue | undefined;
}

export type ProbeTargetOutcome =
  { readonly kind: "response"; readonly challenge: ChallengeRead } | TransportFailure;

export async function probeTarget(
  fetch: FetchLike,
  request: ProbeTargetRequest,
): Promise<ProbeTargetOutcome> {
  const deadline = AbortSignal.timeout(probeTimeoutMs);
  const exchange = {
    url: request.url,
    method: request.method,
    headers: { "Idempotency-Key": request.operationId },
    body: request.body === undefined ? null : JSON.stringify(request.body),
  };
  try {
    const response = await sendBefore(fetch, exchange, deadline);
    const challenge = readChallenge(response);
    await discardBody(response);
    return { kind: "response", challenge };
  } catch (error: unknown) {
    const failure = transportFailure(error, deadline);
    if (failure === null) {
      throw error;
    }
    return failure;
  }
}
