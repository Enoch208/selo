import { encodePaymentRequiredHeader, encodePaymentResponseHeader } from "@x402/core/http";
import { describe, expect, it } from "vitest";
import { readChallenge, readSettlementTxId } from "../../src/payments/challenge-io";
import { challengeFor, testnet } from "./fake-seller";

const withHeader = (name: string, value: string, status = 402): Response =>
  new Response("{}", { status, headers: { [name]: value } });

describe("readChallenge", () => {
  it("decodes a PAYMENT-REQUIRED header with the official decoder", () => {
    const challenge = challengeFor("https://seller.test/paid");
    const read = readChallenge(
      withHeader("PAYMENT-REQUIRED", encodePaymentRequiredHeader(challenge)),
    );
    expect(read).toEqual({
      status: 402,
      decoded: challenge,
      decodeFailed: false,
      decodeError: null,
    });
  });

  it("reports a missing header as nothing decoded, not a failure", () => {
    expect(readChallenge(new Response("{}", { status: 402 }))).toEqual({
      status: 402,
      decoded: null,
      decodeFailed: false,
      decodeError: null,
    });
  });

  it("types an undecodable header as decodeFailed and keeps the message", () => {
    const read = readChallenge(withHeader("PAYMENT-REQUIRED", "!!not-base64!!"));
    expect(read.decoded).toBeNull();
    expect(read.decodeFailed).toBe(true);
    expect(read.decodeError).toMatch(/payment required header/i);
  });

  it("types base64 that is not JSON as decodeFailed", () => {
    const read = readChallenge(withHeader("PAYMENT-REQUIRED", btoa("not json")));
    expect(read.decodeFailed).toBe(true);
    expect(read.decodeError).not.toBeNull();
  });
});

describe("readSettlementTxId", () => {
  const settled = (transaction: string, success = true): string =>
    encodePaymentResponseHeader({ success, transaction, network: testnet });

  it("reads the transaction of a successful settlement", () => {
    const response = withHeader("PAYMENT-RESPONSE", settled("TX123"), 200);
    expect(readSettlementTxId(response)).toEqual({
      txId: "TX123",
      malformed: false,
      errorReason: null,
    });
  });

  it("returns no txId and no flag when the header is absent", () => {
    expect(readSettlementTxId(new Response("ok"))).toEqual({
      txId: null,
      malformed: false,
      errorReason: null,
    });
  });

  it("returns no txId but keeps the errorReason of a settlement that reports failure", () => {
    const failed = encodePaymentResponseHeader({
      success: false,
      transaction: "",
      network: testnet,
      errorReason: "insufficient_funds",
    });
    const response = withHeader("PAYMENT-RESPONSE", failed, 402);
    expect(readSettlementTxId(response)).toEqual({
      txId: null,
      malformed: false,
      errorReason: "insufficient_funds",
    });
  });

  it("flags a present but undecodable header", () => {
    const response = withHeader("PAYMENT-RESPONSE", "%%%", 200);
    expect(readSettlementTxId(response)).toEqual({
      txId: null,
      malformed: true,
      errorReason: null,
    });
  });

  it("flags a decodable header that is not a settle response", () => {
    const response = withHeader("PAYMENT-RESPONSE", btoa(JSON.stringify({ hello: 1 })), 200);
    expect(readSettlementTxId(response)).toEqual({
      txId: null,
      malformed: true,
      errorReason: null,
    });
  });
});
