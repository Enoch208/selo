import type { FacilitatorClient } from "@x402/core/server";
import type {
  PaymentPayload,
  PaymentRequirements,
  SettleResponse,
  SupportedResponse,
  VerifyResponse,
} from "@x402/core/types";
import { merchantNetworks } from "../src/networks";

export const feePayer = "ZMFK2OI7ZBD2U27ISERZC4S6LKM6WMFJPZQ4MYNJDZ2VNBNMBA67RA22AA";

export class FakeFacilitator implements FacilitatorClient {
  readonly settled: PaymentPayload[] = [];

  verify(payload: PaymentPayload): Promise<VerifyResponse> {
    return Promise.resolve({ isValid: true, payer: payload.accepted.payTo });
  }

  settle(payload: PaymentPayload, requirements: PaymentRequirements): Promise<SettleResponse> {
    this.settled.push(payload);
    return Promise.resolve({
      success: true,
      transaction: `MERCHANTTX${String(this.settled.length)}`,
      network: requirements.network,
    });
  }

  getSupported(): Promise<SupportedResponse> {
    return Promise.resolve({
      kinds: Object.values(merchantNetworks).map((network) => ({
        x402Version: 2,
        scheme: "exact",
        network: network.caip2,
        extra: { feePayer },
      })),
      extensions: [],
      signers: { "algorand:*": [feePayer] },
    });
  }
}
