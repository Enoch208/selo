import type { z } from "zod";
import { messageChain } from "../payments/transport";
import {
  leaderboardPageSchema,
  merchantsPageSchema,
  resourcesPageSchema,
  type LeaderboardRow,
  type MerchantRecord,
  type ResourceRecord,
} from "./facilitator-schemas";
import {
  leaderboardRowsFor,
  merchantsFor,
  nextOffset,
  resourcesForDomain,
} from "./facilitator-selectors";
import type { Fetched } from "./fetched";
import { leaderboardSources, type LeaderboardSource, type RowsBySource } from "./g1-checks";

export type ToolFetch = (input: string, init?: RequestInit) => Promise<Response>;

const timeoutMs = 20_000;
const maxPages = 20;

interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
}

const failed = (reason: string): { readonly ok: false; readonly reason: string } => ({
  ok: false,
  reason,
});

export async function getJson<T>(
  fetch: ToolFetch,
  url: string,
  schema: z.ZodType<T>,
): Promise<Fetched<T>> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error: unknown) {
    return failed(`${url}: ${messageChain(error)}`);
  }
  if (!response.ok) {
    await response.body?.cancel();
    return failed(`${url}: HTTP ${String(response.status)}`);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch (error: unknown) {
    return failed(`${url}: body is not JSON (${messageChain(error)})`);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const paths = parsed.error.issues.map((issue) => issue.path.join(".") || "(root)");
    return failed(`${url}: unexpected shape at ${paths.join(", ")}`);
  }
  return { ok: true, value: parsed.data };
}

async function collect<T>(
  fetchPage: (offset: number) => Promise<Fetched<Page<T>>>,
): Promise<Fetched<T[]>> {
  const items: T[] = [];
  let offset: number | null = 0;
  for (let page = 0; page < maxPages && offset !== null; page += 1) {
    const fetched = await fetchPage(offset);
    if (!fetched.ok) {
      return fetched;
    }
    items.push(...fetched.value.items);
    offset = nextOffset({
      offset,
      received: fetched.value.items.length,
      total: fetched.value.total,
    });
  }
  return offset === null
    ? { ok: true, value: items }
    : failed(`listing exceeds ${String(maxPages)} pages; refusing to read further`);
}

const urlOf = (base: string, path: string, query: Record<string, string>): string =>
  `${base}${path}?${new URLSearchParams(query).toString()}`;

export async function fetchDomainResources(
  fetch: ToolFetch,
  base: string,
  domain: string,
): Promise<Fetched<ResourceRecord[]>> {
  const all = await collect(async (offset) => {
    const url = urlOf(base, "/discovery/resources", { limit: "1000", offset: String(offset) });
    const page = await getJson(fetch, url, resourcesPageSchema);
    return page.ok
      ? { ok: true, value: { items: page.value.items, total: page.value.pagination.total } }
      : page;
  });
  return all.ok ? { ok: true, value: resourcesForDomain(all.value, domain) } : all;
}

export async function fetchMerchantsFor(
  fetch: ToolFetch,
  base: string,
  payTo: string,
): Promise<Fetched<MerchantRecord[]>> {
  const all = await collect(async (offset) => {
    const url = urlOf(base, "/discovery/merchants", { limit: "500", offset: String(offset) });
    const page = await getJson(fetch, url, merchantsPageSchema);
    return page.ok
      ? { ok: true, value: { items: page.value.items, total: page.value.pagination.total } }
      : page;
  });
  return all.ok ? { ok: true, value: merchantsFor(all.value, payTo) } : all;
}

function fetchSource(
  fetch: ToolFetch,
  base: string,
  src: LeaderboardSource,
): Promise<Fetched<LeaderboardRow[]>> {
  return collect((offset) => {
    const query = {
      cat: "merchants",
      limit: "200",
      range: "all",
      env: "mainnet",
      src,
      offset: String(offset),
    };
    return getJson(fetch, urlOf(base, "/data/leaderboards", query), leaderboardPageSchema);
  });
}

export async function fetchChallengeRows(
  fetch: ToolFetch,
  base: string,
  payTo: string,
): Promise<Fetched<RowsBySource>> {
  const rows: Partial<Record<LeaderboardSource, readonly LeaderboardRow[]>> = {};
  for (const src of leaderboardSources) {
    const fetched = await fetchSource(fetch, base, src);
    if (!fetched.ok) {
      return failed(`src=${src}: ${fetched.reason}`);
    }
    rows[src] = leaderboardRowsFor(fetched.value, payTo);
  }
  return {
    ok: true,
    value: {
      "x402-global-challenge": rows["x402-global-challenge"] ?? [],
      bazaar: rows.bazaar ?? [],
      direct: rows.direct ?? [],
      dev: rows.dev ?? [],
    },
  };
}
