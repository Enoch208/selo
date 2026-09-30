import { createSafeFetch, type SafeFetch } from "../net/safe-fetch";

export interface AuthorizationDeps {
  readonly ttlHours: number;
  readonly verificationFetch: (origin: string) => SafeFetch;
}

const verificationTimeoutMs = 10_000;

export function liveVerificationFetch(origin: string): SafeFetch {
  return createSafeFetch({ allowedOrigin: origin, timeoutMs: verificationTimeoutMs });
}
