import type {
  PaymentPayloadContext,
  PaymentPayloadResult,
  PaymentRequirements,
  SchemeNetworkClient,
} from "@x402/core/types";
import { ALGORAND_TESTNET_GENESIS_HASH } from "@x402/avm";
import algosdk from "algosdk";

export type PayloadShape = "avm_group" | "opaque";

export interface SignedFixture {
  readonly paymentGroup: readonly string[];
  readonly signedEntry: string;
  readonly txId: string;
}

export interface FakeScheme extends SchemeNetworkClient {
  readonly calls: {
    requirements: PaymentRequirements;
    context: PaymentPayloadContext | undefined;
  }[];
  readonly signed: SignedFixture[];
  failWith: Error | null;
  shape: PayloadShape;
}

const offlineParams: algosdk.SuggestedParams = {
  flatFee: true,
  fee: 0,
  minFee: 1_000,
  firstValid: 1_000,
  lastValid: 2_000,
  genesisID: "testnet-v1.0",
  genesisHash: new Uint8Array(Buffer.from(ALGORAND_TESTNET_GENESIS_HASH, "base64")),
};

async function signOffline(requirements: PaymentRequirements): Promise<SignedFixture> {
  const payer = algosdk.generateAccount();
  const feePayer = algosdk.generateAccount().addr;
  const feeTxn = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
    sender: feePayer,
    receiver: feePayer,
    amount: 0,
    suggestedParams: { ...offlineParams, fee: 2_000 },
  });
  const transfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: payer.addr,
    receiver: requirements.payTo,
    amount: BigInt(requirements.amount),
    assetIndex: BigInt(requirements.asset),
    suggestedParams: offlineParams,
  });
  algosdk.assignGroupID([feeTxn, transfer]);
  const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");
  const signer = algosdk.makeBasicAccountTransactionSigner(payer);
  const signedEntry = toBase64((await algosdk.signTransactionWithSigner(transfer, signer)).blob);
  const paymentGroup = [toBase64(algosdk.encodeUnsignedTransaction(feeTxn)), signedEntry];
  return { paymentGroup, signedEntry, txId: transfer.txID() };
}

export function createFakeScheme(): FakeScheme {
  const calls: FakeScheme["calls"] = [];
  const signed: SignedFixture[] = [];
  const scheme: FakeScheme = {
    scheme: "exact",
    calls,
    signed,
    failWith: null,
    shape: "avm_group",
    async createPaymentPayload(
      x402Version: number,
      requirements: PaymentRequirements,
      context?: PaymentPayloadContext,
    ): Promise<PaymentPayloadResult> {
      calls.push({ requirements, context });
      if (scheme.failWith !== null) {
        throw scheme.failWith;
      }
      const fixture = await signOffline(requirements);
      signed.push(fixture);
      const payload =
        scheme.shape === "avm_group"
          ? { paymentGroup: [...fixture.paymentGroup], paymentIndex: 1 }
          : { opaqueSignature: fixture.signedEntry };
      return { x402Version, payload };
    },
  };
  return scheme;
}
