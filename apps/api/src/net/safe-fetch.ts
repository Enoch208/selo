import { lookup } from "node:dns/promises";
import { classifyAddress } from "@selo/core";
import { createFetchEngine, type SafeFetch } from "./fetch-engine";

export { SafeFetchError, type SafeFetchBlockReason, type SafeFetchFailure } from "./errors";
export type { SafeFetch } from "./fetch-engine";

export interface SafeFetchOptions {
  readonly allowedOrigin: string;
  readonly timeoutMs: number;
}

async function resolveAll(hostname: string): Promise<readonly string[]> {
  const answers = await lookup(hostname, { all: true, verbatim: true });
  return answers.map((answer) => answer.address);
}

export function createSafeFetch(options: SafeFetchOptions): SafeFetch {
  return createFetchEngine({
    allowedOrigin: options.allowedOrigin,
    timeoutMs: options.timeoutMs,
    resolve: resolveAll,
    classify: classifyAddress,
    connectPort: undefined,
  });
}
