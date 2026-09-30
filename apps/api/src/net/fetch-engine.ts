import type { AddressClass } from "@selo/core";
import { fetch as undiciFetch } from "undici";
import { blocked, classifyFailure, SafeFetchError, type AbortSources } from "./errors";
import { createPinnedAgent } from "./pinned-agent";
import { isRedirect, maxRedirects, redirectedHop, type Hop } from "./redirects";
import { parseTarget, type Target } from "./target";

export interface FetchEngineConfig {
  readonly allowedOrigin: string;
  readonly timeoutMs: number;
  readonly resolve: (hostname: string) => Promise<readonly string[]>;
  readonly classify: (ip: string) => AddressClass;
  readonly connectPort: number | undefined;
}

export type SafeFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(new Error("aborted while resolving", { cause: signal.reason }));
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

const requestUrl = (input: string | URL | Request): string =>
  input instanceof Request ? input.url : String(input);

function toRequest(input: string | URL | Request, init: RequestInit | undefined): Request {
  try {
    return new Request(input, init);
  } catch (error: unknown) {
    throw blocked("TARGET_URL_INVALID", error);
  }
}

async function firstHop(request: Request): Promise<Hop> {
  const body = request.body === null ? null : new Uint8Array(await request.arrayBuffer());
  return { url: request.url, method: request.method, headers: [...request.headers], body };
}

export function createFetchEngine(config: FetchEngineConfig): SafeFetch {
  const allowedOrigin = URL.parse(config.allowedOrigin)?.origin ?? null;

  function vetTarget(url: string): Target {
    const parsed = parseTarget(url);
    if (!parsed.ok) {
      throw blocked(parsed.reason);
    }
    if (parsed.target.origin !== allowedOrigin) {
      throw blocked("ORIGIN_NOT_ALLOWED");
    }
    return parsed.target;
  }

  async function vetAddress(hostname: string, signal: AbortSignal): Promise<string> {
    const addresses = await abortable(config.resolve(hostname), signal);
    const [first] = addresses;
    if (first === undefined) {
      throw new SafeFetchError(
        { kind: "network" },
        new Error(`no addresses for ${hostname}`),
        false,
      );
    }
    if (addresses.some((address) => config.classify(address) !== "public")) {
      throw blocked("TARGET_ADDRESS_BLOCKED");
    }
    return first;
  }

  async function send(
    request: Request,
    sources: AbortSources,
    onDispatch: () => void,
  ): Promise<Response> {
    const signal = AbortSignal.any([sources.timeout, sources.caller]);
    let hop = await firstHop(request);
    for (let redirects = 0; ; redirects += 1) {
      const target = vetTarget(hop.url);
      const address = await vetAddress(target.hostname, signal);
      const dispatcher = createPinnedAgent({
        hostname: target.hostname,
        address,
        connectPort: config.connectPort,
      });
      onDispatch();
      const response = await undiciFetch(target.href, {
        method: hop.method,
        headers: [...hop.headers],
        body: hop.body,
        redirect: "manual",
        signal,
        dispatcher,
      }).catch(async (error: unknown) => {
        await dispatcher.destroy();
        throw error;
      });
      const location = response.headers.get("location");
      if (!isRedirect(response.status, location) || request.redirect === "manual") {
        return response;
      }
      await response.body?.cancel();
      await dispatcher.close();
      if (request.redirect === "error") {
        throw blocked("REDIRECT_NOT_ALLOWED");
      }
      if (redirects === maxRedirects) {
        throw blocked("TOO_MANY_REDIRECTS");
      }
      hop = redirectedHop(hop, response.status, location, target.href);
    }
  }

  return async (input, init) => {
    const timeout = AbortSignal.timeout(config.timeoutMs);
    let caller = new AbortController().signal;
    let dispatched = false;
    try {
      vetTarget(requestUrl(input));
      const request = toRequest(input, init);
      caller = request.signal;
      return await send(request, { timeout, caller }, () => {
        dispatched = true;
      });
    } catch (error: unknown) {
      throw classifyFailure(error, { timeout, caller }, dispatched);
    }
  };
}
