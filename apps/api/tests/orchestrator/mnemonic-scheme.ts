import { ALGORAND_TESTNET_GENESIS_HASH } from "@x402/avm";
import type {
  PaymentPayloadResult,
  PaymentRequirements,
  SchemeNetworkClient,
} from "@x402/core/types";
import algosdk from "algosdk";

export interface MnemonicScheme extends SchemeNetworkClient {
  readonly signedTxIds: string[];
  failWith: Error | null;
  hang: boolean;
  opaque: boolean;
}

export const operatorMnemonic = algosdk.secretKeyToMnemonic(algosdk.generateAccount().sk);

const offlineParams: algosdk.SuggestedParams = {
  flatFee: true,
  fee: 0,
  minFee: 1_000,
  firstValid: 1_000,
  lastValid: 2_000,
  genesisID: "testnet-v1.0",
  genesisHash: new Uint8Array(Buffer.from(ALGORAND_TESTNET_GENESIS_HASH, "base64")),
};

const toBase64 = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64");

export function createMnemonicScheme(mnemonic: string): MnemonicScheme {
  const signedTxIds: string[] = [];
  const scheme: MnemonicScheme = {
    scheme: "exact",
    signedTxIds,
    failWith: null,
    hang: false,
    opaque: false,
    async createPaymentPayload(
      x402Version: number,
      requirements: PaymentRequirements,
    ): Promise<PaymentPayloadResult> {
      if (scheme.hang) {
        return new Promise<PaymentPayloadResult>(() => undefined);
      }
      if (scheme.failWith !== null) {
        throw scheme.failWith;
      }
      const payer = algosdk.mnemonicToSecretKey(mnemonic);
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
      const signer = algosdk.makeBasicAccountTransactionSigner(payer);
      const signed = await algosdk.signTransactionWithSigner(transfer, signer);
      signedTxIds.push(transfer.txID());
      if (scheme.opaque) {
        return { x402Version, payload: { opaque: toBase64(signed.blob) } };
      }
      return {
        x402Version,
        payload: {
          paymentGroup: [
            toBase64(algosdk.encodeUnsignedTransaction(feeTxn)),
            toBase64(signed.blob),
          ],
          paymentIndex: 1,
        },
      };
    },
  };
  return scheme;
}
