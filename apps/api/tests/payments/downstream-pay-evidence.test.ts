import { beforeEach, describe, expect, it } from "vitest";
import {
  createDownstreamPayer,
  type FetchLike,
  type PayRequest,
} from "../../src/payments/downstream";
import { createFakeScheme, type FakeScheme } from "./fake-scheme";
import {
  challengeFor,
  createFakeSeller,
  offeredAccept,
  sellerFetch,
  settleFailure,
  testnet,
  type FakeSeller,
} from "./fake-seller";

const url = "https://seller.test/paid";
const request: PayRequest = {
  url,
  method: "POST",
  operationId: "op-evidence",
  decoded: challengeFor(url),
  requirement: {
    network: offeredAccept.network,
    asset: offeredAccept.asset,
    amount: offeredAccept.amount,
    payTo: offeredAccept.payTo,
  },
  timeoutMs: 1_000,
  maxBodyBytes: 1_024,
};

let seller: FakeSeller;
let scheme: FakeScheme;
const payWith = (fetch: FetchLike, overrides: Partial<PayRequest> = {}) =>
  createDownstreamPayer({ fetch, scheme, network: testnet }).pay({ ...request, ...overrides });
const signedTxId = (): string | undefined => scheme.signed[0]?.txId;

beforeEach(() => {
  seller = createFakeSeller();
  scheme = createFakeScheme();
});

describe("downstream pay: expected on-chain txid", () => {
  it("derives the txid of the signed transfer at paymentIndex on a delivered payment", async () => {
    const outcome = await payWith(sellerFetch(seller));
    expect(outcome).toMatchObject({
      kind: "delivered",
      expectedTxId: signedTxId(),
      expectedTxIdUnavailable: false,
    });
    expect(signedTxId()).toMatch(/^[A-Z2-7]{52}$/);
  });

  it("carries the expected txid and the settle errorReason on a rejected payment", async () => {
    seller.behaviour.paidStatus = 402;
    seller.behaviour.settlement = "failed";
    expect(await payWith(sellerFetch(seller))).toMatchObject({
      kind: "rejected",
      status: 402,
      errorReason: settleFailure,
      expectedTxId: signedTxId(),
      expectedTxIdUnavailable: false,
    });
  });

  it("carries the expected txid on an ambiguous payment", async () => {
    const hanging: FetchLike = () => new Promise<Response>(() => undefined);
    expect(await payWith(hanging, { timeoutMs: 20 })).toMatchObject({
      kind: "ambiguous",
      expectedTxId: signedTxId(),
      expectedTxIdUnavailable: false,
    });
  });

  it("flags a payload that is not an AVM payment group instead of guessing a txid", async () => {
    scheme.shape = "opaque";
    expect(await payWith(sellerFetch(seller))).toMatchObject({
      kind: "delivered",
      expectedTxId: null,
      expectedTxIdUnavailable: true,
    });
  });
});

describe("downstream pay: request body and body reads", () => {
  it("sends the JSON body with the signed header and keeps its exact bytes for replay", async () => {
    const body = { query: "x402", nested: { limit: 3 } };
    const outcome = await payWith(sellerFetch(seller), { body });
    expect(seller.paidRequests[0]).toMatchObject({
      method: "POST",
      contentType: "application/json",
      body: '{"query":"x402","nested":{"limit":3}}',
    });
    expect(outcome.kind === "delivered" && outcome.replayHeader.body).toBe(
      '{"query":"x402","nested":{"limit":3}}',
    );
  });

  it("types a body that cannot be read, outside the deadline, as a network failure", async () => {
    const stubborn = new ReadableStream<Uint8Array>({
      cancel() {
        return Promise.reject(new Error("cancel refused"));
      },
    });
    const response = new Response(stubborn, { status: 200, headers: { "content-length": "99" } });
    const outcome = await payWith(() => Promise.resolve(response), { maxBodyBytes: 10 });
    expect(outcome).toMatchObject({
      kind: "delivered",
      bodyText: null,
      bodyReadFailure: "network",
    });
  });

  it("types a body that outlives the deadline as a timeout", async () => {
    const endless = new ReadableStream<Uint8Array>({ pull: () => new Promise(() => undefined) });
    const outcome = await payWith(() => Promise.resolve(new Response(endless)), {
      timeoutMs: 30,
    });
    expect(outcome).toMatchObject({
      kind: "delivered",
      bodyText: null,
      bodyReadFailure: "timeout",
    });
  });
});
