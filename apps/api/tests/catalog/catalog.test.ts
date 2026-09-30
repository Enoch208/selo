import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogClient } from "../../src/catalog/client";

const baseUrl = "https://facilitator.test";

interface Item {
  readonly resourceUrl: string;
  readonly method: string;
  readonly settleCount?: number;
}

function itemsNamed(count: number, start: number): Item[] {
  return Array.from({ length: count }, (_, index) => ({
    resourceUrl: `https://seller-${String(start + index)}.example/v1/paid`,
    method: "GET",
  }));
}

class FakeCatalog {
  readonly requests: string[] = [];
  items: readonly Item[] = [];
  answer: ((url: URL) => Promise<Response>) | null = null;

  readonly fetch = (input: string | URL | Request): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    this.requests.push(url.pathname + url.search);
    if (this.answer !== null) {
      return this.answer(url);
    }
    const limit = Number(url.searchParams.get("limit"));
    const offset = Number(url.searchParams.get("offset"));
    return Promise.resolve(
      Response.json({
        x402Version: 2,
        items: this.items.slice(offset, offset + limit),
        pagination: { limit, offset, total: this.items.length },
      }),
    );
  };
}

function clientFor(catalog: FakeCatalog, clock = { now: 0 }) {
  return createCatalogClient({
    baseUrl,
    fetch: catalog.fetch,
    ttlMs: 60_000,
    now: () => clock.now,
  });
}

describe("bazaar catalog client", () => {
  it("pages through the discovery list and finds the record by resource url and method", async () => {
    const catalog = new FakeCatalog();
    const wanted: Item = {
      resourceUrl: "https://api.example.com/v1/quote",
      method: "POST",
      settleCount: 4,
    };
    catalog.items = [...itemsNamed(1500, 0), wanted, ...itemsNamed(829, 1500)];
    const outcome = await clientFor(catalog).find(wanted.resourceUrl, "POST");
    expect(outcome).toEqual({ kind: "found", record: wanted });
    expect(catalog.requests).toEqual([
      "/discovery/resources?limit=1000&offset=0",
      "/discovery/resources?limit=1000&offset=1000",
      "/discovery/resources?limit=1000&offset=2000",
    ]);
  });

  it("requires the method to match as well as the resource url", async () => {
    const catalog = new FakeCatalog();
    catalog.items = [{ resourceUrl: "https://api.example.com/v1/quote", method: "GET" }];
    expect(await clientFor(catalog).find("https://api.example.com/v1/quote", "POST")).toEqual({
      kind: "not_found",
    });
  });

  it("caches the full list for the ttl and refetches after it", async () => {
    const catalog = new FakeCatalog();
    catalog.items = itemsNamed(3, 0);
    const clock = { now: 1_000 };
    const client = clientFor(catalog, clock);
    await client.find("https://seller-0.example/v1/paid", "GET");
    clock.now += 59_999;
    expect(await client.find("https://seller-2.example/v1/paid", "GET")).toMatchObject({
      kind: "found",
    });
    expect(catalog.requests).toHaveLength(1);
    clock.now += 1;
    await client.find("https://seller-1.example/v1/paid", "GET");
    expect(catalog.requests).toHaveLength(2);
  });

  it("stops paging on an empty page even if the total claims more", async () => {
    const catalog = new FakeCatalog();
    catalog.answer = (url) =>
      Promise.resolve(
        Response.json({
          items: [],
          pagination: { limit: 1000, offset: Number(url.searchParams.get("offset")), total: 5000 },
        }),
      );
    expect(await clientFor(catalog).find("https://x.example/a", "GET")).toEqual({
      kind: "not_found",
    });
    expect(catalog.requests).toHaveLength(1);
  });

  it("reports unavailable on an HTTP error and does not cache the failure", async () => {
    const catalog = new FakeCatalog();
    catalog.answer = () => Promise.resolve(new Response("boom", { status: 500 }));
    const client = clientFor(catalog);
    expect(await client.find("https://x.example/a", "GET")).toMatchObject({ kind: "unavailable" });
    catalog.answer = null;
    catalog.items = [{ resourceUrl: "https://x.example/a", method: "GET" }];
    expect(await client.find("https://x.example/a", "GET")).toMatchObject({ kind: "found" });
  });

  it("reports unavailable on a timeout", async () => {
    const catalog = new FakeCatalog();
    catalog.answer = () =>
      Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    const outcome = await clientFor(catalog).find("https://x.example/a", "GET");
    expect(outcome).toMatchObject({ kind: "unavailable" });
    expect(outcome.kind === "unavailable" && outcome.message).toContain("timeout");
  });

  it("passes a per-page timeout signal to the fetch", async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    const client = createCatalogClient({
      baseUrl,
      fetch: (_input, init) => {
        signals.push(init?.signal);
        return Promise.resolve(
          Response.json({ items: [], pagination: { limit: 1000, offset: 0, total: 0 } }),
        );
      },
    });
    await client.find("https://x.example/a", "GET");
    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });

  it("reports unavailable on a body that is not JSON", async () => {
    const catalog = new FakeCatalog();
    catalog.answer = () => Promise.resolve(new Response("<html>", { status: 200 }));
    expect(await clientFor(catalog).find("https://x.example/a", "GET")).toMatchObject({
      kind: "unavailable",
    });
  });

  it("reports unavailable on JSON that is not the discovery envelope", async () => {
    const catalog = new FakeCatalog();
    catalog.answer = () => Promise.resolve(Response.json({ items: "nope" }));
    expect(await clientFor(catalog).find("https://x.example/a", "GET")).toMatchObject({
      kind: "unavailable",
    });
  });

  it("skips catalog items that do not carry a resource url and method", async () => {
    const catalog = new FakeCatalog();
    catalog.answer = () =>
      Promise.resolve(
        Response.json({
          items: [
            null,
            7,
            { resourceUrl: "https://x.example/a" },
            { resourceUrl: "https://x.example/a", method: "GET" },
          ],
          pagination: { limit: 1000, offset: 0, total: 4 },
        }),
      );
    expect(await clientFor(catalog).find("https://x.example/a", "GET")).toEqual({
      kind: "found",
      record: { resourceUrl: "https://x.example/a", method: "GET" },
    });
  });

  it("gives up as unavailable after 20 pages from a server that never shortens its pages", async () => {
    const catalog = new FakeCatalog();
    catalog.answer = (url) =>
      Promise.resolve(
        Response.json({
          items: itemsNamed(1000, 0),
          pagination: {
            limit: 1000,
            offset: Number(url.searchParams.get("offset")),
            total: 1_000_000,
          },
        }),
      );
    const outcome = await clientFor(catalog).find("https://x.example/a", "GET");
    expect(outcome).toMatchObject({ kind: "unavailable" });
    expect(outcome.kind === "unavailable" && outcome.message).toContain("20 pages");
    expect(catalog.requests).toHaveLength(20);
  });

  it("reports unavailable when the server ignores the requested offset", async () => {
    const catalog = new FakeCatalog();
    catalog.answer = () =>
      Promise.resolve(
        Response.json({
          items: itemsNamed(1000, 0),
          pagination: { limit: 1000, offset: 0, total: 5000 },
        }),
      );
    const outcome = await clientFor(catalog).find("https://x.example/a", "GET");
    expect(outcome).toMatchObject({ kind: "unavailable" });
    expect(catalog.requests).toHaveLength(2);
  });

  describe("with fake timers", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    it("bounds the whole load with a 20 s deadline", async () => {
      vi.useFakeTimers();
      const catalog = new FakeCatalog();
      catalog.answer = () => new Promise<Response>(() => undefined);
      const pending = clientFor(catalog).find("https://x.example/a", "GET");
      await vi.advanceTimersByTimeAsync(19_999);
      let settled = false;
      void pending.then(() => {
        settled = true;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const outcome = await pending;
      expect(outcome).toMatchObject({ kind: "unavailable" });
      expect(outcome.kind === "unavailable" && outcome.message).toContain("20000 ms");
    });
  });
});
