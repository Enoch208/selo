import { beforeEach, describe, expect, it } from "vitest";
import { SafeFetchError } from "../../src/net/safe-fetch";
import {
  createDownstreamPayer,
  RequirementMismatch,
  type FetchLike,
  type PayRequest,
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
const request: PayRequest = {
  url,
  method: "GET",
  operationId: "op-pay-1",
  decoded: challengeFor(url),
  requirement,
  timeoutMs: 1_000,
  maxBodyBytes: 1_024,
};

let seller: FakeSeller;
let scheme: FakeScheme;
const payWith = (fetch: FetchLike, overrides: Partial<PayRequest> = {}) =>
  createDownstreamPayer({ fetch, scheme, network: testnet }).pay({ ...request, ...overrides });

beforeEach(() => {
  seller = createFakeSeller();
  scheme = createFakeScheme();
});

describe("downstream pay", () => {
  it("signs exactly the guarded accept and nothing else", async () => {
    await payWith(sellerFetch(seller));
    expect(scheme.calls).toHaveLength(1);
    expect(scheme.calls[0]?.requirements).toEqual(offeredAccept);
    expect(scheme.calls[0]?.context?.maxAmountPerPayment).toBe(offeredAccept.amount);
    expect(seller.paidRequests).toHaveLength(1);
    expect(seller.paidRequests[0]?.payload.accepted).toEqual(offeredAccept);
    expect(seller.paidRequests[0]?.payload.resource).toEqual(challengeFor(url).resource);
    expect(seller.paidRequests[0]?.idempotencyKey).toBe("op-pay-1");
  });

  it("throws RequirementMismatch without signing when the challenge does not offer the requirement", async () => {
    for (const mismatch of [
      { ...requirement, amount: "10001" },
      { ...requirement, payTo: "SOMEONEELSE" },
      { ...requirement, asset: "31566704" },
      { ...requirement, network: "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=" },
    ]) {
      await expect(payWith(sellerFetch(seller), { requirement: mismatch })).rejects.toBeInstanceOf(
        RequirementMismatch,
      );
    }
    await expect(payWith(sellerFetch(seller), { decoded: { nope: true } })).rejects.toBeInstanceOf(
      RequirementMismatch,
    );
    expect(scheme.calls).toEqual([]);
    expect(seller.paidRequests).toEqual([]);
  });

  it("returns delivered with the settlement txId and the replay header", async () => {
    const before = Date.now();
    const outcome = await payWith(sellerFetch(seller));
    expect(outcome).toMatchObject({
      kind: "delivered",
      status: 200,
      contentType: "application/json",
      bodyText: '{"ok":1}',
      bodyTooLarge: false,
      bodyReadFailure: null,
      txId: settlementTx,
      settlementHeaderMalformed: false,
    });
    if (outcome.kind !== "delivered") {
      throw new Error("expected delivered");
    }
    expect(outcome.requestedAt.getTime()).toBeGreaterThanOrEqual(before);
    expect(outcome.replayHeader.name).toBe("PAYMENT-SIGNATURE");
    expect(outcome.replayHeader.value).toBe(seller.paidRequests[0]?.signature);
  });

  it("returns delivered for a 500 that still carries a settlement txId", async () => {
    seller.behaviour.paidStatus = 500;
    expect(await payWith(sellerFetch(seller))).toMatchObject({
      kind: "delivered",
      status: 500,
      txId: settlementTx,
    });
  });

  it("flags a malformed settlement header on a delivered response", async () => {
    seller.behaviour.settlement = "malformed";
    expect(await payWith(sellerFetch(seller))).toMatchObject({
      kind: "delivered",
      txId: null,
      settlementHeaderMalformed: true,
    });
  });

  it("drops a body over maxBodyBytes and says so", async () => {
    seller.behaviour.body = "x".repeat(64);
    expect(await payWith(sellerFetch(seller), { maxBodyBytes: 16 })).toMatchObject({
      kind: "delivered",
      bodyText: null,
      bodyTooLarge: true,
    });
  });

  it("returns rejected when the target answers 402 without a settlement", async () => {
    seller.behaviour.paidStatus = 402;
    seller.behaviour.settlement = "failed";
    const outcome = await payWith(sellerFetch(seller));
    expect(outcome).toMatchObject({ kind: "rejected", status: 402 });
  });

  it("treats a 402 with an undecodable settlement header as ambiguous", async () => {
    seller.behaviour.paidStatus = 402;
    seller.behaviour.settlement = "malformed";
    expect((await payWith(sellerFetch(seller))).kind).toBe("ambiguous");
  });

  it("returns ambiguous when the paid request outlives timeoutMs", async () => {
    const hanging: FetchLike = () => new Promise<Response>(() => undefined);
    const outcome = await payWith(hanging, { timeoutMs: 30 });
    expect(outcome.kind).toBe("ambiguous");
    expect(outcome.kind === "ambiguous" && outcome.requestedAt).toBeInstanceOf(Date);
    expect(scheme.calls).toHaveLength(1);
  });

  it.each([
    [
      "blocked",
      new SafeFetchError({ kind: "blocked", reason: "TOO_MANY_REDIRECTS" }, undefined, true),
    ],
    ["network", new SafeFetchError({ kind: "network" }, new Error("socket hang up"), true)],
    ["timeout", new SafeFetchError({ kind: "timeout" }, undefined, true)],
    ["unexpected", new TypeError("fetch failed")],
  ])("classifies a %s failure after dispatch as ambiguous", async (_, error) => {
    const outcome = await payWith(() => Promise.reject(error));
    expect(outcome.kind).toBe("ambiguous");
  });

  it("returns blocked only when the block provably happened before dispatch", async () => {
    const error = new SafeFetchError(
      { kind: "blocked", reason: "TARGET_ADDRESS_BLOCKED" },
      undefined,
      false,
    );
    expect(await payWith(() => Promise.reject(error))).toEqual({
      kind: "blocked",
      reason: "TARGET_ADDRESS_BLOCKED",
    });
  });

  it.each([
    ["network", new SafeFetchError({ kind: "network" }, new Error("connect ECONNREFUSED"), false)],
    ["timeout", new SafeFetchError({ kind: "timeout" }, new Error("dns slow"), false)],
  ])("returns network_error_before_send for a %s failure before dispatch", async (_, error) => {
    const outcome = await payWith(() => Promise.reject(error));
    expect(outcome.kind).toBe("network_error_before_send");
    expect(outcome.kind === "network_error_before_send" && outcome.message).toContain("safe fetch");
  });

  it("returns signing_failed and sends nothing when the scheme cannot sign", async () => {
    scheme.failWith = new Error("algod unreachable");
    const outcome = await payWith(sellerFetch(seller));
    expect(outcome).toEqual({ kind: "signing_failed", message: "algod unreachable" });
    expect(seller.paidRequests).toEqual([]);
  });

  it("never follows a redirect with a signed payment", async () => {
    const inits: RequestInit[] = [];
    const spying: FetchLike = (input, init) => {
      inits.push(init);
      return sellerFetch(seller)(input, init);
    };
    await payWith(spying);
    expect(inits.map((init) => init.redirect)).toEqual(["manual"]);
  });
});
