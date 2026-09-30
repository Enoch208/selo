import type { FacilitatorClient } from "@x402/core/server";
import { FacilitatorTimeoutError } from "@x402/core/server";
import { SettleError } from "@x402/core/types";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from "@x402/core/types";
import { seloNetworks } from "../../src/payments/networks";

export const facilitatorFeePayer = "ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA";
export const inboundPayer = "A4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DQOBYHA4DVZ36IB4";

export type SettleMode =
  | "success"
  | "rejected"
  | "timeout"
  | "unreachable"
  | "same-tx"
  | "settle-error-500"
  | "settle-error-400"
  | "pending"
  | "pending-thrown"
  | "failed-with-tx";

export const pendingTx = "PENDINGINBOUNDTX";
export const failedTx = "FAILEDINBOUNDTX";

type FailureShape = {
  readonly status: number | null;
  readonly errorReason: string;
  readonly transaction: string;
  readonly errorMessage?: string;
};

const failures: Partial<Record<SettleMode, FailureShape>> = {
  rejected: { status: null, errorReason: "invalid_transaction_state", transaction: "" },
  "settle-error-500": { status: 500, errorReason: "unexpected_settle_error", transaction: "" },
  "settle-error-400": { status: 400, errorReason: "invalid_payload", transaction: "" },
  pending: { status: null, errorReason: "settlement_pending", transaction: pendingTx },
  "pending-thrown": { status: 409, errorReason: "settlement_pending", transaction: pendingTx },
  "failed-with-tx": {
    status: null,
    errorReason: "transaction_failed",
    errorMessage: "algod rejected the group after broadcast",
    transaction: failedTx,
  },
};

export interface FacilitatorCall {
  readonly operation: "verify" | "settle";
  readonly startedAt: number;
  readonly completedAt: number;
  readonly payload: PaymentPayload;
}

const settleDelayMs = 20;

export class FakeFacilitator implements FacilitatorClient {
  readonly calls: FacilitatorCall[] = [];
  settleMode: SettleMode = "success";
  verifyTimesOut = false;
  private sequence = 0;
  private settled = 0;

  tick(): number {
    this.sequence += 1;
    return this.sequence;
  }

  reset(): void {
    this.calls.length = 0;
    this.settleMode = "success";
    this.verifyTimesOut = false;
    this.settled = 0;
  }

  settleCalls(): readonly FacilitatorCall[] {
    return this.calls.filter((call) => call.operation === "settle");
  }

  verify(paymentPayload: PaymentPayload): Promise<VerifyResponse> {
    const startedAt = this.tick();
    this.calls.push({
      operation: "verify",
      startedAt,
      completedAt: this.tick(),
      payload: paymentPayload,
    });
    if (this.verifyTimesOut) {
      return Promise.reject(new FacilitatorTimeoutError("verify", 30_000));
    }
    return Promise.resolve({ isValid: true, payer: inboundPayer });
  }

  async settle(
    paymentPayload: PaymentPayload,
    requirements: PaymentRequirements,
  ): Promise<SettleResponse> {
    const startedAt = this.tick();
    await new Promise((resolve) => setTimeout(resolve, settleDelayMs));
    this.calls.push({
      operation: "settle",
      startedAt,
      completedAt: this.tick(),
      payload: paymentPayload,
    });
    if (this.settleMode === "timeout") {
      throw new FacilitatorTimeoutError("settle", 30_000);
    }
    if (this.settleMode === "unreachable") {
      throw new TypeError("fetch failed");
    }
    const failure = failures[this.settleMode];
    if (failure !== undefined) {
      const response: SettleResponse = {
        success: false,
        errorReason: failure.errorReason,
        transaction: failure.transaction,
        network: requirements.network,
        ...(failure.errorMessage === undefined ? {} : { errorMessage: failure.errorMessage }),
      };
      if (failure.status !== null) {
        throw new SettleError(failure.status, response);
      }
      return response;
    }
    this.settled += 1;
    const transaction =
      this.settleMode === "same-tx" ? "INBOUNDTXSHARED" : `INBOUNDTX${String(this.settled)}`;
    return { success: true, transaction, network: requirements.network, payer: inboundPayer };
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
