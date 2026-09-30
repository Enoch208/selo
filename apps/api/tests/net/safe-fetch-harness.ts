import { classifyAddress } from "@selo/core";
import { createFetchEngine } from "../../src/net/fetch-engine";
import { SafeFetchError, type SafeFetch, type SafeFetchFailure } from "../../src/net/safe-fetch";
import { fixtureOrigin } from "./tls-fixture";

export const loopbackAsPublic = (ip: string): "public" | "blocked" | "invalid" =>
  ip === "127.0.0.1" ? "public" : classifyAddress(ip);

export interface HarnessOptions {
  readonly port: number;
  readonly resolve?: (hostname: string) => Promise<readonly string[]>;
  readonly classify?: (ip: string) => "public" | "blocked" | "invalid";
  readonly allowedOrigin?: string;
  readonly timeoutMs?: number;
}

export function localSafeFetch(options: HarnessOptions): SafeFetch {
  return createFetchEngine({
    allowedOrigin: options.allowedOrigin ?? fixtureOrigin,
    timeoutMs: options.timeoutMs ?? 5_000,
    resolve: options.resolve ?? (() => Promise.resolve(["127.0.0.1"])),
    classify: options.classify ?? loopbackAsPublic,
    connectPort: options.port,
  });
}

export async function errorOf(pending: Promise<Response>): Promise<unknown> {
  return pending.then(
    () => null,
    (reason: unknown) => reason,
  );
}

export async function safeErrorOf(pending: Promise<Response>): Promise<SafeFetchError> {
  const error = await errorOf(pending);
  if (!(error instanceof SafeFetchError)) {
    throw new Error(`expected a SafeFetchError, got ${String(error)}`);
  }
  return error;
}

export async function failureOf(pending: Promise<Response>): Promise<SafeFetchFailure> {
  return (await safeErrorOf(pending)).failure;
}
