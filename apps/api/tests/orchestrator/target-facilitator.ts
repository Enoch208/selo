import type { FacilitatorClient } from "@x402/core/server";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from "@x402/core/types";
import { expectedTxIdOf } from "../../src/payments/expected-txid";
import { seloNetworks } from "../../src/payments/networks";
import { facilitatorFeePayer } from "../support/fake-facilitator";

export type ReplayPolicy = "reject_duplicate" | "same_tx" | "settle_again";

export class TargetFacilitator implements FacilitatorClient {
  readonly settled: { readonly key: string; readonly txId: string }[] = [];
  settleCalls = 0;
  rejectFirstSettle = false;
  settleFailureReason = "invalid_exact_avm_payload_transaction";
  verifyInvalidReason: string | null = null;
  replay: ReplayPolicy = "reject_duplicate";
  fixedTxId: string | null = null;

  reset(): void {
    this.settled.length = 0;
    this.settleCalls = 0;
    this.rejectFirstSettle = false;
    this.settleFailureReason = "invalid_exact_avm_payload_transaction";
    this.verifyInvalidReason = null;
    this.replay = "reject_duplicate";
    this.fixedTxId = null;
  }

  verify(paymentPayload: PaymentPayload): Promise<VerifyResponse> {
    if (this.verifyInvalidReason !== null) {
      return Promise.resolve({ isValid: false, invalidReason: this.verifyInvalidReason });
    }
    return Promise.resolve({ isValid: true, payer: paymentPayload.accepted.payTo });
  }

  settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
    this.settleCalls += 1;
    const key = JSON.stringify(payload.payload);
    const failure = (errorReason: string): SettleResponse => ({
      success: false,
      errorReason,
      transaction: "",
      network: requirements.network,
    });
    if (this.rejectFirstSettle) {
      return Promise.resolve(failure(this.settleFailureReason));
    }
    const previous = this.settled.find((entry) => entry.key === key);
    if (previous !== undefined && this.replay === "reject_duplicate") {
      return Promise.resolve(failure("transaction_already_in_ledger"));
    }
    const txId =
      previous !== undefined && this.replay === "same_tx"
        ? previous.txId
        : previous !== undefined
          ? `SECONDSETTLEMENTTX${String(this.settled.length + 1)}`
          : (this.fixedTxId ?? this.onChainTxId(payload));
    this.settled.push({ key, txId });
    return Promise.resolve({ success: true, transaction: txId, network: requirements.network });
  }

  private onChainTxId(payload: PaymentPayload): string {
    return expectedTxIdOf(payload).expectedTxId ?? `TARGETTX${String(this.settled.length + 1)}`;
  }

  getSupported(): Promise<SupportedResponse> {
    return Promise.resolve({
      kinds: Object.values(seloNetworks).map((network) => ({
        x402Version: 2,
        scheme: "exact",
        network: network.caip2,
        extra: { feePayer: facilitatorFeePayer },
      })),
      extensions: [],
      signers: { "algorand:*": [facilitatorFeePayer] },
    });
  }
}
