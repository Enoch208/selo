import type { SchemeNetworkClient } from "@x402/core/types";
import { SafeFetchError } from "../net/safe-fetch";
import { createDownstreamPayer, type DownstreamPayer } from "../payments/downstream";
import { sanitizeHeaders } from "../payments/sanitize-headers";
import type { FetchLike } from "../payments/transport";
import { handshakeTimeoutMs, paidTimeoutMs, type RunnerDeps } from "./deps";

export interface TargetIo {
  readonly probe: DownstreamPayer;
  readonly paid: DownstreamPayer;
  lastHeaders(): Readonly<Record<string, string>> | null;
}

const clockExpired = (signal: AbortSignal, afterDispatch: boolean): SafeFetchError =>
  new SafeFetchError({ kind: "timeout" }, signal.reason, afterDispatch);

function untilClock<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(clockExpired(signal, true));
    };
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
    pending.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

export function createTargetIo(deps: RunnerDeps, origin: string, signal: AbortSignal): TargetIo {
  let last: Readonly<Record<string, string>> | null = null;

  const bounded =
    (fetch: FetchLike): FetchLike =>
    async (input, init) => {
      last = null;
      if (signal.aborted) {
        throw clockExpired(signal, false);
      }
      const combined = init.signal ? AbortSignal.any([init.signal, signal]) : signal;
      const response = await untilClock(fetch(input, { ...init, signal: combined }), signal);
      last = sanitizeHeaders(response.headers);
      return response;
    };

  const scheme: SchemeNetworkClient = {
    scheme: deps.scheme.scheme,
    createPaymentPayload: (version, requirements, context) =>
      untilClock(deps.scheme.createPaymentPayload(version, requirements, context), signal),
  };

  const payer = (timeoutMs: number): DownstreamPayer =>
    createDownstreamPayer({
      fetch: bounded(deps.targetFetch({ allowedOrigin: origin, timeoutMs })),
      scheme,
      network: deps.network.caip2,
    });

  return { probe: payer(handshakeTimeoutMs), paid: payer(paidTimeoutMs), lastHeaders: () => last };
}
