import { describe, expect, it } from "vitest";
import { SafeFetchError } from "../../src/net/safe-fetch";
import {
  createDownstreamPayer,
  type DownstreamPayer,
  type FetchLike,
} from "../../src/payments/downstream";
import { createFakeScheme, type FakeScheme } from "./fake-scheme";
import {
  challengeFor,
  createFakeSeller,
  offeredAccept,
  sellerFetch,
  settlementTx,
  testnet,
  type FakeSeller,
} from "./fake-seller";

const url = "https://seller.test/paid";
const requirement = {
  network: offeredAccept.network,
  asset: offeredAccept.asset,
  amount: offeredAccept.amount,
  payTo: offeredAccept.payTo,
};

interface Harness {
  readonly seller: FakeSeller;
  readonly scheme: FakeScheme;
  readonly payer: DownstreamPayer;
}

function harness(fetch?: FetchLike): Harness {
  const seller = createFakeSeller();
  const scheme = createFakeScheme();
  const payer = createDownstreamPayer({
    fetch: fetch ?? sellerFetch(seller),
    scheme,
    network: testnet,
  });
  return { seller, scheme, payer };
}

async function delivered(h: Harness) {
  const outcome = await h.payer.pay({
    url,
    method: "GET",
    operationId: "op-replay",
    decoded: challengeFor(url),
    requirement,
    timeoutMs: 1_000,
    maxBodyBytes: 1_024,
  });
  if (outcome.kind !== "delivered") {
    throw new Error(`expected delivered, got ${outcome.kind}`);
  }
  return outcome;
}

describe("downstream replay", () => {
  it("re-sends the identical signed header without signing again", async () => {
    const h = harness();
    const paid = await delivered(h);
    const replayed = await h.payer.replay({
      url,
      method: "GET",
      operationId: "op-replay",
      replayHeader: paid.replayHeader,
      timeoutMs: 1_000,
    });
    expect(replayed).toEqual({
      kind: "response",
      status: 200,
      txId: settlementTx,
      settlementHeaderMalformed: false,
      bodyText: '{"ok":1}',
    });
    expect(h.scheme.calls).toHaveLength(1);
    expect(h.seller.paidRequests).toHaveLength(2);
    expect(h.seller.paidRequests[1]?.signature).toBe(h.seller.paidRequests[0]?.signature);
    expect(h.seller.paidRequests[1]?.idempotencyKey).toBe("op-replay");
  });

  it("types replay transport failures", async () => {
    const paid = await delivered(harness());
    const replayWith = (fetch: FetchLike, timeoutMs = 1_000) =>
      harness(fetch).payer.replay({
        url,
        method: "GET",
        operationId: "op-replay",
        replayHeader: paid.replayHeader,
        timeoutMs,
      });
    expect(await replayWith(() => new Promise<Response>(() => undefined), 30)).toEqual({
      kind: "timeout",
    });
    const network = new SafeFetchError({ kind: "network" }, new Error("reset"));
    expect((await replayWith(() => Promise.reject(network))).kind).toBe("network_error");
    const block = new SafeFetchError({ kind: "blocked", reason: "TOO_MANY_REDIRECTS" });
    expect(await replayWith(() => Promise.reject(block))).toEqual({
      kind: "blocked",
      reason: "TOO_MANY_REDIRECTS",
    });
  });
});

describe("downstream replay of a POST", () => {
  it("re-sends the byte-identical body captured at payment time", async () => {
    const h = harness();
    const body: { query: string; tags: string[] } = { query: "x402", tags: ["a"] };
    const paid = await h.payer.pay({
      url,
      method: "POST",
      operationId: "op-post",
      decoded: challengeFor(url),
      requirement,
      timeoutMs: 1_000,
      maxBodyBytes: 1_024,
      body,
    });
    if (paid.kind !== "delivered") {
      throw new Error(`expected delivered, got ${paid.kind}`);
    }
    body.tags.push("mutated after payment");
    await h.payer.replay({
      url,
      method: "POST",
      operationId: "op-post",
      replayHeader: paid.replayHeader,
      timeoutMs: 1_000,
    });
    const [first, second] = h.seller.paidRequests;
    expect(second?.body).toBe('{"query":"x402","tags":["a"]}');
    expect(second?.body).toBe(first?.body);
    expect(second?.contentType).toBe("application/json");
    expect(second?.signature).toBe(first?.signature);
    expect(h.scheme.calls).toHaveLength(1);
  });
});
