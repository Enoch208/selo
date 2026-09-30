import type { HttpMethod } from "@selo/core";
import { z } from "zod";

export type CatalogLookup =
  | { readonly kind: "found"; readonly record: unknown }
  | { readonly kind: "not_found" }
  | { readonly kind: "unavailable"; readonly message: string };

export interface CatalogClient {
  find(resourceUrl: string, method: HttpMethod): Promise<CatalogLookup>;
}

export interface CatalogClientOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof fetch;
  readonly ttlMs?: number;
  readonly now?: () => number;
}

const pageLimit = 1000;
const pageTimeoutMs = 10_000;
const loadTimeoutMs = 20_000;
const maxPages = 20;

const envelopeSchema = z.looseObject({
  items: z.array(z.unknown()),
  pagination: z.looseObject({
    limit: z.number().int().nonnegative(),
    offset: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
  }),
});

const keySchema = z.looseObject({ resourceUrl: z.string(), method: z.string() });

class CatalogUnavailable extends Error {
  override readonly name = "CatalogUnavailable";
}

const messageOf = (error: unknown): string =>
  error instanceof Error ? `${error.name}: ${error.message}` : String(error);

const deadlineAfter = (ms: number) => {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new CatalogUnavailable(`discovery load exceeded ${String(ms)} ms`));
  }, ms);
  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timer);
    },
  };
};

function raced<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => {
      reject(signal.reason instanceof Error ? signal.reason : new CatalogUnavailable("aborted"));
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

async function readPage(
  fetchPage: typeof fetch,
  baseUrl: string,
  offset: number,
  load: AbortSignal,
): Promise<z.output<typeof envelopeSchema>> {
  const url = new URL("/discovery/resources", baseUrl);
  url.searchParams.set("limit", String(pageLimit));
  url.searchParams.set("offset", String(offset));
  const signal = AbortSignal.any([AbortSignal.timeout(pageTimeoutMs), load]);
  const response = await fetchPage(url.href, { headers: { accept: "application/json" }, signal });
  if (!response.ok) {
    await response.body?.cancel();
    throw new CatalogUnavailable(`discovery page answered HTTP ${String(response.status)}`);
  }
  const envelope = envelopeSchema.safeParse(await response.json());
  if (!envelope.success) {
    throw new CatalogUnavailable(`discovery page is malformed: ${envelope.error.message}`);
  }
  if (envelope.data.pagination.offset !== offset) {
    throw new CatalogUnavailable(
      `discovery page for offset ${String(offset)} answered offset ${String(envelope.data.pagination.offset)}`,
    );
  }
  return envelope.data;
}

async function readPages(
  fetchPage: typeof fetch,
  baseUrl: string,
  load: AbortSignal,
): Promise<readonly unknown[]> {
  const items: unknown[] = [];
  let offset = 0;
  for (let pages = 0; pages < maxPages; pages += 1) {
    const page = await raced(readPage(fetchPage, baseUrl, offset, load), load);
    items.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.pagination.total) {
      return items;
    }
  }
  throw new CatalogUnavailable(`discovery list exceeded ${String(maxPages)} pages`);
}

async function readAll(fetchPage: typeof fetch, baseUrl: string): Promise<readonly unknown[]> {
  const deadline = deadlineAfter(loadTimeoutMs);
  try {
    return await readPages(fetchPage, baseUrl, deadline.signal);
  } finally {
    deadline.clear();
  }
}

function matches(item: unknown, resourceUrl: string, method: HttpMethod): boolean {
  const key = keySchema.safeParse(item);
  return key.success && key.data.resourceUrl === resourceUrl && key.data.method === method;
}

export function createCatalogClient(options: CatalogClientOptions): CatalogClient {
  const fetchPage = options.fetch ?? fetch;
  const ttlMs = options.ttlMs ?? 60_000;
  const now = options.now ?? Date.now;
  let cached: { readonly at: number; readonly items: Promise<readonly unknown[]> } | null = null;

  function items(): Promise<readonly unknown[]> {
    const at = now();
    if (cached !== null && at - cached.at < ttlMs) {
      return cached.items;
    }
    const loading = readAll(fetchPage, options.baseUrl);
    const entry = { at, items: loading };
    cached = entry;
    loading.catch(() => {
      if (cached === entry) {
        cached = null;
      }
    });
    return loading;
  }

  return {
    async find(resourceUrl, method) {
      try {
        const record = (await items()).find((item) => matches(item, resourceUrl, method));
        return record === undefined ? { kind: "not_found" } : { kind: "found", record };
      } catch (error: unknown) {
        return { kind: "unavailable", message: messageOf(error) };
      }
    },
  };
}
