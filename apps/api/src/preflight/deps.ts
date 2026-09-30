import type { CatalogClient } from "../catalog/client";
import { createSafeFetch } from "../net/safe-fetch";
import type { SeloNetwork } from "../payments/networks";
import type { FetchLike } from "../payments/transport";

export interface PreflightDeps {
  readonly probeFetch: (allowedOrigin: string) => FetchLike;
  readonly catalog: CatalogClient;
  readonly network: SeloNetwork;
  readonly jobMaxSpendMicros: number;
  readonly seloPriceMicros: number;
  readonly ttlMinutes: number;
}

export const probeTimeoutMs = 10_000;

export function liveProbeFetch(allowedOrigin: string): FetchLike {
  return createSafeFetch({ allowedOrigin, timeoutMs: probeTimeoutMs });
}
