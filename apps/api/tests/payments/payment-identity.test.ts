import { isValidPaymentId, PAYMENT_IDENTIFIER } from "@x402/extensions/payment-identifier";
import type { PaymentRequired } from "@x402/core/types";
import { beforeEach, describe, expect, it } from "vitest";
import { createDownstreamPayer, type PayRequest } from "../../src/payments/downstream";
import { paymentIdFor, withPaymentIdentity } from "../../src/payments/payment-identity";
import { createFakeScheme, type FakeScheme } from "./fake-scheme";
import {
  challengeFor,
  createFakeSeller,
  offeredAccept,
  sellerFetch,
  testnet,
  type FakeSeller,
} from "./fake-seller";

const url = "https://seller.test/paid";
const requiredIdentifier = {
  info: { required: true },
  schema: { type: "object", required: ["required"] },
};

const identifiedChallenge = (): PaymentRequired => ({
  ...challengeFor(url),
  extensions: {
    ...challengeFor(url).extensions,
    [PAYMENT_IDENTIFIER]: structuredClone(requiredIdentifier),
  },
});

const request = (decoded: PaymentRequired): PayRequest => ({
  url,
  method: "POST",
  operationId: "job_01KAZX5Q0Y3W2N4R8T6V9B1C7D:paid_delivery",
  decoded,
  requirement: {
    network: offeredAccept.network,
    asset: offeredAccept.asset,
    amount: offeredAccept.amount,
    payTo: offeredAccept.payTo,
  },
  body: { message: "hello" },
  timeoutMs: 1_000,
  maxBodyBytes: 1_024,
});

let seller: FakeSeller;
let scheme: FakeScheme;

beforeEach(() => {
  seller = createFakeSeller();
  scheme = createFakeScheme();
});

describe("payment identity", () => {
  it("derives a valid, stable payment id from the operation id", () => {
    const id = paymentIdFor("job_01KAZX5Q0Y3W2N4R8T6V9B1C7D:paid_delivery");
    expect(isValidPaymentId(id)).toBe(true);
    expect(paymentIdFor("job_01KAZX5Q0Y3W2N4R8T6V9B1C7D:paid_delivery")).toBe(id);
    expect(id).not.toBe(paymentIdFor("job_01KAZX5Q0Y3W2N4R8T6V9B1C7D:retry_safety"));
  });

  it("pads a short operation id and clips a long one into the allowed range", () => {
    expect(isValidPaymentId(paymentIdFor("op-1"))).toBe(true);
    expect(isValidPaymentId(paymentIdFor("x".repeat(400)))).toBe(true);
  });

  it("sets the id only when the challenge declares the extension, without mutating it", () => {
    const decoded = identifiedChallenge();
    const identified = withPaymentIdentity(decoded, "op-identified-0001");
    expect(identified.extensions?.[PAYMENT_IDENTIFIER]).toMatchObject({
      info: { required: true, id: paymentIdFor("op-identified-0001") },
    });
    expect(decoded.extensions?.[PAYMENT_IDENTIFIER]).toEqual(requiredIdentifier);
    const plain = challengeFor(url);
    expect(withPaymentIdentity(plain, "op-identified-0001")).toBe(plain);
  });

  it("carries the payment id in the signed payment and reuses it on replay", async () => {
    const payer = createDownstreamPayer({ fetch: sellerFetch(seller), scheme, network: testnet });
    const paid = await payer.pay(request(identifiedChallenge()));
    if (paid.kind !== "delivered") {
      throw new Error(`expected delivered, got ${paid.kind}`);
    }
    const expectedId = paymentIdFor("job_01KAZX5Q0Y3W2N4R8T6V9B1C7D:paid_delivery");
    expect(seller.paidRequests[0]?.payload.extensions?.[PAYMENT_IDENTIFIER]).toMatchObject({
      info: { id: expectedId },
    });
    await payer.replay({
      url,
      method: "POST",
      operationId: "job_01KAZX5Q0Y3W2N4R8T6V9B1C7D:paid_delivery",
      replayHeader: paid.replayHeader,
      timeoutMs: 1_000,
    });
    expect(seller.paidRequests).toHaveLength(2);
    expect(seller.paidRequests[1]?.payload.extensions?.[PAYMENT_IDENTIFIER]).toMatchObject({
      info: { id: expectedId },
    });
    expect(scheme.calls).toHaveLength(1);
  });

  it("sends no payment id when the target does not ask for one", async () => {
    const payer = createDownstreamPayer({ fetch: sellerFetch(seller), scheme, network: testnet });
    await payer.pay(request(challengeFor(url)));
    expect(seller.paidRequests[0]?.payload.extensions?.[PAYMENT_IDENTIFIER]).toBeUndefined();
  });
});
