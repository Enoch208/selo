import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogClient } from "../../src/catalog/client";

const baseUrl = "https://facilitator.test";

const payTo = "MERCHANTPAYTOADDRESS";
const serverPageCap = 100;

interface Item {
  readonly resourceUrl: string;
  readonly method: string;
  readonly payTo?: string;
  readonly settleCount?: number;
}

function itemsNamed(count: number, start: number, owner = payTo): Item[] {
  return Array.from({ length: count }, (_, index) => ({
    resourceUrl: `https://seller-${String(start + index)}.example/v1/paid`,
    method: "GET",
    payTo: owner,
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
    const limit = Math.min(Number(url.searchParams.get("limit")), serverPageCap);
    const offset = Number(url.searchParams.get("offset"));
    const owner = url.searchParams.get("payTo");
    const listed = owner === null ? this.items : this.items.filter((item) => item.payTo === owner);
    return Promise.resolve(
      Response.json({
        x402Version: 2,
        items: listed.slice(offset, offset + limit),
        pagination: { limit, offset, total: listed.length },
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
  it("asks only for the live payee's listings, so a large catalog stays one request", async () => {
    const catalog = new FakeCatalog();
    const wanted: Item = {
      resourceUrl: "https://api.example.com/v1/quote",
      method: "POST",
      payTo,
      settleCount: 4,
    };
    catalog.items = [
      ...itemsNamed(1500, 0, "OTHERPAYEE"),
      wanted,
      ...itemsNamed(1190, 1500, "THIRD"),
    ];
    const outcome = await clientFor(catalog).find(wanted.resourceUrl, "POST", payTo);
    expect(outcome).toEqual({ kind: "found", record: wanted });
    expect(catalog.requests).toEqual([`/discovery/resources?payTo=${payTo}&limit=100&offset=0`]);
  });

  it("pages through a payee's listings at the server's page cap", async () => {
    const catalog = new FakeCatalog();
    catalog.items = itemsNamed(250, 0);
    const outcome = await clientFor(catalog).find(
      "https://seller-249.example/v1/paid",
      "GET",
      payTo,
    );
    expect(outcome).toMatchObject({ kind: "found" });
    expect(catalog.requests).toEqual([
      `/discovery/resources?payTo=${payTo}&limit=100&offset=0`,
      `/discovery/resources?payTo=${payTo}&limit=100&offset=100`,
      `/discovery/resources?payTo=${payTo}&limit=100&offset=200`,
    ]);
  });

  it("does not report a listing that names another payee", async () => {
    const catalog = new FakeCatalog();
    catalog.items = itemsNamed(3, 0, "OTHERPAYEE");
    expect(await clientFor(catalog).find("https://seller-0.example/v1/paid", "GET", payTo)).toEqual(
      {
        kind: "not_found",
      },
    );
  });

  it("caches each payee's listings separately", async () => {
    const catalog = new FakeCatalog();
    catalog.items = [...itemsNamed(2, 0), ...itemsNamed(2, 10, "SECONDPAYEE")];
    const client = clientFor(catalog);
    await client.find("https://seller-0.example/v1/paid", "GET", payTo);
    await client.find("https://seller-1.example/v1/paid", "GET", payTo);
    expect(
      await client.find("https://seller-10.example/v1/paid", "GET", "SECONDPAYEE"),
    ).toMatchObject({
      kind: "found",
    });
    expect(catalog.requests).toHaveLength(2);
  });

  it("requires the method to match as well as the resource url", async () => {
    const catalog = new FakeCatalog();
    catalog.items = [{ resourceUrl: "https://api.example.com/v1/quote", method: "GET", payTo }];
    expect(
      await clientFor(catalog).find("https://api.example.com/v1/quote", "POST", payTo),
    ).toEqual({
      kind: "not_found",
    });
  });

  it("caches the full list for the ttl and refetches after it", async () => {
    const catalog = new FakeCatalog();
    catalog.items = itemsNamed(3, 0);
    const clock = { now: 1_000 };
    const client = clientFor(catalog, clock);
    await client.find("https://seller-0.example/v1/paid", "GET", payTo);
    clock.now += 59_999;
    expect(await client.find("https://seller-2.example/v1/paid", "GET", payTo)).toMatchObject({
      kind: "found",
    });
    expect(catalog.requests).toHaveLength(1);
    clock.now += 1;
    await client.find("https://seller-1.example/v1/paid", "GET", payTo);
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
    expect(await clientFor(catalog).find("https://x.example/a", "GET", payTo)).toEqual({
      kind: "not_found",
    });
    expect(catalog.requests).toHaveLength(1);
  });

  it("reports unavailable on an HTTP error and does not cache the failure", async () => {
    const catalog = new FakeCatalog();
    catalog.answer = () => Promise.resolve(new Response("boom", { status: 500 }));
    const client = clientFor(catalog);
    expect(await client.find("https://x.example/a", "GET", payTo)).toMatchObject({
      kind: "unavailable",
    });
    catalog.answer = null;
    catalog.items = [{ resourceUrl: "https://x.example/a", method: "GET", payTo }];
    expect(await client.find("https://x.example/a", "GET", payTo)).toMatchObject({ kind: "found" });
  });

  it("reports unavailable on a timeout", async () => {
    const catalog = new FakeCatalog();
    catalog.answer = () =>
      Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    const outcome = await clientFor(catalog).find("https://x.example/a", "GET", payTo);
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
    await client.find("https://x.example/a", "GET", payTo);
    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });

  it("reports unavailable on a body that is not JSON", async () => {
    const catalog = new FakeCatalog();
    catalog.answer = () => Promise.resolve(new Response("<html>", { status: 200 }));
    expect(await clientFor(catalog).find("https://x.example/a", "GET", payTo)).toMatchObject({
      kind: "unavailable",
    });
  });

  it("reports unavailable on JSON that is not the discovery envelope", async () => {
    const catalog = new FakeCatalog();
    catalog.answer = () => Promise.resolve(Response.json({ items: "nope" }));
    expect(await clientFor(catalog).find("https://x.example/a", "GET", payTo)).toMatchObject({
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
    expect(await clientFor(catalog).find("https://x.example/a", "GET", payTo)).toEqual({
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
    const outcome = await clientFor(catalog).find("https://x.example/a", "GET", payTo);
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
    const outcome = await clientFor(catalog).find("https://x.example/a", "GET", payTo);
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
      const pending = clientFor(catalog).find("https://x.example/a", "GET", payTo);
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
