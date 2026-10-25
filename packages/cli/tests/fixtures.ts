import { checkIds, type CheckResult, type ReleaseTestResponse, type Verdict } from "@selo/core";
import { ALGORAND_TESTNET_GENESIS_HASH } from "@x402/avm";
import type {
  PaymentPayloadResult,
  PaymentRequirements,
  SchemeNetworkClient,
} from "@x402/core/types";
import algosdk from "algosdk";

export const reportToken = "PRIVATEREPORTTOKENaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

export function passingChecks(): CheckResult[] {
  return checkIds.map((id) => ({
    id,
    status: "PASS",
    code: `${id.toUpperCase()}_OK`,
    blocking: true,
    summary: `${id} proven`,
    evidence: [`ev_${id}`],
  }));
}

export function report(verdict: Verdict, checks = passingChecks()): ReleaseTestResponse {
  return {
    jobId: "job_TESTJOB1",
    verdict,
    target: "https://shop.example.com/v1/orders",
    checks,
    warnings: [],
    inconclusiveReason: verdict === "INCONCLUSIVE" ? "EVIDENCE_INCOMPLETE" : null,
    money: {
      seloInboundTxId: "INBOUNDTXFROMSELO",
      downstreamSpendUsdc: "0.01",
      downstreamTxIds: ["DOWNSTREAMTXTOTARGET"],
    },
    reportUrl: `https://selo.test/v1/reports/${reportToken}`,
  };
}

export function failingReport(): ReleaseTestResponse {
  const checks = passingChecks().map((check) =>
    check.id === "response_contract"
      ? { ...check, status: "FAIL" as const, code: "SCHEMA_MISMATCH", summary: "receiptId missing" }
      : check,
  );
  return report("FAIL", checks);
}

export function inconclusiveReport(): ReleaseTestResponse {
  const checks = passingChecks().map((check) =>
    check.id === "discovery_contract"
      ? { ...check, status: "INCONCLUSIVE" as const, code: "CATALOG_UNAVAILABLE" }
      : check,
  );
  return report("INCONCLUSIVE", checks);
}

const offlineParams: algosdk.SuggestedParams = {
  flatFee: true,
  fee: 1_000,
  minFee: 1_000,
  firstValid: 1_000,
  lastValid: 2_000,
  genesisID: "testnet-v1.0",
  genesisHash: new Uint8Array(Buffer.from(ALGORAND_TESTNET_GENESIS_HASH, "base64")),
};

export interface OfflineScheme extends SchemeNetworkClient {
  readonly signed: PaymentRequirements[];
}

export function offlineScheme(payer: algosdk.Account): OfflineScheme {
  const signed: PaymentRequirements[] = [];
  return {
    scheme: "exact",
    signed,
    async createPaymentPayload(
      x402Version: number,
      requirements: PaymentRequirements,
    ): Promise<PaymentPayloadResult> {
      signed.push(requirements);
      const transfer = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
        sender: payer.addr,
        receiver: requirements.payTo,
        amount: BigInt(requirements.amount),
        assetIndex: BigInt(requirements.asset),
        note: new Uint8Array(Buffer.from(String(signed.length))),
        suggestedParams: offlineParams,
      });
      const signer = algosdk.makeBasicAccountTransactionSigner(payer);
      const blob = (await algosdk.signTransactionWithSigner(transfer, signer)).blob;
      return {
        x402Version,
        payload: { paymentGroup: [Buffer.from(blob).toString("base64")], paymentIndex: 0 },
      };
    },
  };
}
