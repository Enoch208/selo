import { describe, expect, it } from "vitest";
import { SafeFetchError } from "../../src/net/safe-fetch";
import { createDownstreamPayer, type FetchLike } from "../../src/payments/downstream";
import { createFakeScheme } from "./fake-scheme";
import { challengeFor, createFakeSeller, sellerFetch, testnet } from "./fake-seller";

const origin = "https://seller.test";
const probeOf = (fetch: FetchLike, path = "/paid") =>
  createDownstreamPayer({ fetch, scheme: createFakeScheme(), network: testnet }).probe({
    url: `${origin}${path}`,
    method: "GET",
    operationId: "op-probe-1",
    timeoutMs: 1_000,
  });

const throwing =
  (error: unknown): FetchLike =>
  () =>
    Promise.reject(error instanceof Error ? error : new Error(String(error)));

describe("downstream probe", () => {
  it("decodes the 402 challenge and sends the operation id as Idempotency-Key", async () => {
    const seller = createFakeSeller();
    const outcome = await probeOf(sellerFetch(seller));
    expect(outcome).toEqual({
      kind: "response",
      status: 402,
      contentType: "application/json",
      challenge: {
        status: 402,
        decoded: challengeFor(`${origin}/paid`),
        decodeFailed: false,
        decodeError: null,
      },
    });
    expect(seller.unpaidRequests).toEqual([
      { idempotencyKey: "op-probe-1", method: "GET", contentType: null, body: "" },
    ]);
    expect(seller.paidRequests).toEqual([]);
  });

  it("reports a 402 without a PAYMENT-REQUIRED header as nothing decoded", async () => {
    const outcome = await probeOf(sellerFetch(createFakeSeller()), "/no-header");
    expect(outcome).toMatchObject({
      kind: "response",
      status: 402,
      challenge: { decoded: null, decodeFailed: false },
    });
  });

  it("reports an undecodable PAYMENT-REQUIRED header as decodeFailed", async () => {
    const outcome = await probeOf(sellerFetch(createFakeSeller()), "/malformed");
    expect(outcome).toMatchObject({
      kind: "response",
      status: 402,
      challenge: { decoded: null, decodeFailed: true },
    });
  });

  it("maps a safe-fetch block to blocked", async () => {
    const error = new SafeFetchError({ kind: "blocked", reason: "TARGET_ADDRESS_BLOCKED" });
    expect(await probeOf(throwing(error))).toEqual({
      kind: "blocked",
      reason: "TARGET_ADDRESS_BLOCKED",
    });
  });

  it("maps a safe-fetch timeout to timeout", async () => {
    expect(await probeOf(throwing(new SafeFetchError({ kind: "timeout" })))).toEqual({
      kind: "timeout",
    });
  });

  it("maps a safe-fetch network failure to network_error with its message", async () => {
    const error = new SafeFetchError({ kind: "network" }, new Error("connect ECONNREFUSED"));
    const outcome = await probeOf(throwing(error));
    expect(outcome.kind).toBe("network_error");
    expect(outcome.kind === "network_error" && outcome.message).toContain("ECONNREFUSED");
  });

  it("times out a target that never answers", async () => {
    const hanging: FetchLike = () => new Promise<Response>(() => undefined);
    const payer = createDownstreamPayer({
      fetch: hanging,
      scheme: createFakeScheme(),
      network: testnet,
    });
    const outcome = await payer.probe({
      url: `${origin}/paid`,
      method: "GET",
      operationId: "op-hang",
      timeoutMs: 30,
    });
    expect(outcome).toEqual({ kind: "timeout" });
  });

  it("lets an unexpected error propagate as a Selo bug", async () => {
    const bug = new RangeError("selo bug");
    await expect(probeOf(throwing(bug))).rejects.toBe(bug);
  });

  it("sends a JSON body with its content type when one is given", async () => {
    const seller = createFakeSeller();
    const payer = createDownstreamPayer({
      fetch: sellerFetch(seller),
      scheme: createFakeScheme(),
      network: testnet,
    });
    await payer.probe({
      url: `${origin}/paid`,
      method: "POST",
      operationId: "op-body",
      timeoutMs: 1_000,
      body: { query: "x402", limit: 3 },
    });
    expect(seller.unpaidRequests).toEqual([
      {
        idempotencyKey: "op-body",
        method: "POST",
        contentType: "application/json",
        body: '{"query":"x402","limit":3}',
      },
    ]);
  });

  it("types a response body that fails to discard as network_error", async () => {
    const stubborn = new ReadableStream<Uint8Array>({
      cancel() {
        return Promise.reject(new Error("cancel refused"));
      },
    });
    const outcome = await probeOf(() => Promise.resolve(new Response(stubborn, { status: 402 })));
    expect(outcome.kind).toBe("network_error");
    expect(outcome.kind === "network_error" && outcome.message).toContain("cancel refused");
  });
});
