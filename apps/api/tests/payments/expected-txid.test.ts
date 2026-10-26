import type { PaymentPayload } from "@x402/core/types";
import { ALGORAND_TESTNET_GENESIS_HASH } from "@x402/avm";
import algosdk from "algosdk";
import { describe, expect, it } from "vitest";
import { expectedTxIdOf } from "../../src/payments/expected-txid";
import { createFakeScheme } from "./fake-scheme";
import { offeredAccept } from "./fake-seller";

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

const payloadOf = (payload: Record<string, unknown>): PaymentPayload => ({
  x402Version: 2,
  accepted: offeredAccept,
  payload,
});

async function signedTransferValidUntil(lastValid: number) {
  const payer = algosdk.generateAccount();
  const transfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: payer.addr,
    receiver: offeredAccept.payTo,
    amount: 10_000n,
    assetIndex: BigInt(offeredAccept.asset),
    suggestedParams: {
      flatFee: true,
      fee: 0,
      minFee: 1_000,
      firstValid: lastValid - 100,
      lastValid,
      genesisID: "testnet-v1.0",
      genesisHash: new Uint8Array(Buffer.from(ALGORAND_TESTNET_GENESIS_HASH, "base64")),
    },
  });
  const signer = algosdk.makeBasicAccountTransactionSigner(payer);
  const signed = await algosdk.signTransactionWithSigner(transfer, signer);
  return { entry: toBase64(signed.blob), txId: transfer.txID() };
}

describe("expectedTxIdOf: the signed transfer's identity and validity window", () => {
  it("reads the tx id and last valid round of the transfer at paymentIndex", async () => {
    const scheme = createFakeScheme();
    const result = await scheme.createPaymentPayload(2, offeredAccept);
    expect(expectedTxIdOf(payloadOf(result.payload))).toEqual({
      expectedTxId: scheme.signed[0]?.txId,
      expectedTxIdUnavailable: false,
      lastValidRound: 2_000,
    });
  });

  it("carries a realistic Mainnet-sized last valid round exactly", async () => {
    const transfer = await signedTransferValidUntil(57_123_456);
    const payload = payloadOf({ paymentGroup: [transfer.entry], paymentIndex: 0 });
    expect(expectedTxIdOf(payload)).toEqual({
      expectedTxId: transfer.txId,
      expectedTxIdUnavailable: false,
      lastValidRound: 57_123_456,
    });
  });

  it.each([
    ["an opaque payload", { opaque: "AAAA" }],
    ["a paymentIndex outside the group", { paymentGroup: ["AAAA"], paymentIndex: 3 }],
    [
      "an entry that is not a signed transaction",
      { paymentGroup: ["bm90IGEgdHhu"], paymentIndex: 0 },
    ],
  ])("derives neither tx id nor last valid round from %s", (_, payload) => {
    expect(expectedTxIdOf(payloadOf(payload))).toEqual({
      expectedTxId: null,
      expectedTxIdUnavailable: true,
      lastValidRound: null,
    });
  });
});
