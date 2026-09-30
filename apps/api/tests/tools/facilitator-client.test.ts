import { describe, expect, it } from "vitest";
import {
  fetchChallengeRows,
  fetchDomainResources,
  fetchMerchantsFor,
  type ToolFetch,
} from "../../src/tools/facilitator-client";
import leaderboard from "./fixtures/leaderboard-challenge.json";
import merchants from "./fixtures/merchants-page.json";
import resources from "./fixtures/resources-page.json";

const base = "https://facilitator.test";
const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

function recording(respond: (url: URL) => Response | Promise<Response>) {
  const urls: URL[] = [];
  const fetch: ToolFetch = (input) => {
    const url = new URL(input);
    urls.push(url);
    return Promise.resolve(respond(url));
  };
  return { fetch, urls };
}

describe("fetchDomainResources", () => {
  it("pages the whole catalog by offset and selects the domain", async () => {
    const [first, second, ...rest] = resources.items;
    const pages = [
      { items: [first, second], pagination: { limit: 2, offset: 0, total: 5 } },
      { items: rest.slice(0, 2), pagination: { limit: 2, offset: 2, total: 5 } },
      { items: rest.slice(2), pagination: { limit: 2, offset: 4, total: 5 } },
    ];
    const { fetch, urls } = recording((url) => {
      const offset = Number(url.searchParams.get("offset"));
      return json(pages[offset / 2]);
    });
    const found = await fetchDomainResources(fetch, base, "hashlock.pronodealgo.xyz");
    expect(urls.map((url) => url.searchParams.get("offset"))).toEqual(["0", "2", "4"]);
    expect(urls[0]?.pathname).toBe("/discovery/resources");
    expect(urls[0]?.searchParams.get("limit")).toBe("1000");
    expect(found.ok && found.value.map((item) => item.resourceUrl)).toEqual([
      "https://hashlock.pronodealgo.xyz/api/timestamp",
    ]);
  });

  it("reports an HTTP error as a failure with the status", async () => {
    const { fetch } = recording(() => new Response("down", { status: 503 }));
    expect(await fetchDomainResources(fetch, base, "x.test")).toEqual({
      ok: false,
      reason: `${base}/discovery/resources?limit=1000&offset=0: HTTP 503`,
    });
  });

  it("reports a body that is not the documented shape", async () => {
    const { fetch } = recording(() => json({ items: "nope" }));
    const found = await fetchDomainResources(fetch, base, "x.test");
    expect(found.ok).toBe(false);
    expect(!found.ok && found.reason).toMatch(/unexpected shape/);
  });

  it("reports invalid JSON and network errors instead of throwing", async () => {
    const invalid = recording(() => new Response("<html>", { status: 200 }));
    expect((await fetchDomainResources(invalid.fetch, base, "x.test")).ok).toBe(false);
    const broken: ToolFetch = () => Promise.reject(new TypeError("fetch failed"));
    const found = await fetchDomainResources(broken, base, "x.test");
    expect(!found.ok && found.reason).toMatch(/fetch failed/);
  });
});

describe("page cap", () => {
  it("fails after 20 non-empty pages instead of reading an endless listing", async () => {
    const [record] = resources.items;
    const { fetch, urls } = recording((url) =>
      json({
        items: [record],
        pagination: { limit: 1, offset: Number(url.searchParams.get("offset")), total: 1e9 },
      }),
    );
    const found = await fetchDomainResources(fetch, base, "x.test");
    expect(urls).toHaveLength(20);
    expect(found).toEqual({
      ok: false,
      reason: "listing exceeds 20 pages; refusing to read further",
    });
  });
});

describe("fetchMerchantsFor", () => {
  it("selects the payTo merchant from the paged list", async () => {
    const { fetch, urls } = recording((url) =>
      json(url.searchParams.get("offset") === "0" ? merchants : { ...merchants, items: [] }),
    );
    const payTo = "QSNLPPXO64ONBD76E2DLZW6XER5GUV4YPQYHDFJUO2N3IO4RYBL5HRU6EY";
    const found = await fetchMerchantsFor(fetch, base, payTo);
    expect(urls[0]?.pathname).toBe("/discovery/merchants");
    expect(urls[0]?.searchParams.get("limit")).toBe("500");
    expect(found.ok && found.value.map((item) => item.id)).toEqual([
      "UVNOTFBQWE82NE9OQkQ3NkUyRExaVzZY",
    ]);
  });
});

describe("fetchChallengeRows", () => {
  it("reads every source for the Mainnet merchants leaderboard", async () => {
    const payTo = "EH5BHWISPB7MEIITJIWF2VB3YFN2RZLJMWBRV6CBJV76FBAEAALL6XKSQE";
    const { fetch, urls } = recording((url) =>
      json(
        url.searchParams.get("src") === "x402-global-challenge" &&
          url.searchParams.get("offset") === "0"
          ? leaderboard
          : { items: [], total: 0 },
      ),
    );
    const found = await fetchChallengeRows(fetch, base, payTo);
    expect(
      urls
        .filter((url) => url.searchParams.get("offset") === "0")
        .map((url) => url.searchParams.get("src")),
    ).toEqual(["x402-global-challenge", "bazaar", "direct", "dev"]);
    expect(Object.fromEntries(urls[0]?.searchParams ?? [])).toMatchObject({
      cat: "merchants",
      range: "all",
      env: "mainnet",
    });
    expect(found.ok && found.value["x402-global-challenge"].map((row) => row.rank)).toEqual([5]);
    expect(found.ok && found.value.direct).toEqual([]);
  });

  it("pages a leaderboard that caps the page size below its total", async () => {
    const { fetch, urls } = recording((url) => {
      const offset = Number(url.searchParams.get("offset"));
      const items = offset === 0 ? leaderboard.items : [];
      return json({ items, total: 7, limit: 5, offset });
    });
    await fetchChallengeRows(fetch, base, "NOPE");
    expect(
      urls
        .filter((url) => url.searchParams.get("src") === "bazaar")
        .map((url) => url.searchParams.get("offset")),
    ).toEqual(["0", "5"]);
  });

  it("names the failing source", async () => {
    const { fetch } = recording((url) =>
      url.searchParams.get("src") === "dev"
        ? new Response("", { status: 500 })
        : json({ items: [], total: 0 }),
    );
    const found = await fetchChallengeRows(fetch, base, "NOPE");
    expect(!found.ok && found.reason).toMatch(/src=dev.*HTTP 500/);
  });
});
