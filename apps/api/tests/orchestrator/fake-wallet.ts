import type { AccountHoldings, WalletBalance } from "../../src/payments/wallet-balance";
import { targetNetwork } from "./stock-seller";

export class FakeWalletBalance implements WalletBalance {
  algoMicros = 5_000_000n;
  minBalanceMicros = 200_000n;
  usdcOptedIn = true;
  usdcMicros = 10_000_000n;
  failure: Error | null = null;
  reads = 0;

  reset(): void {
    this.algoMicros = 5_000_000n;
    this.minBalanceMicros = 200_000n;
    this.usdcOptedIn = true;
    this.usdcMicros = 10_000_000n;
    this.failure = null;
    this.reads = 0;
  }

  readonly read = (): Promise<AccountHoldings> => {
    this.reads += 1;
    if (this.failure !== null) {
      return Promise.reject(this.failure);
    }
    const assets = this.usdcOptedIn
      ? [{ assetId: BigInt(targetNetwork.usdcAssetId), amount: this.usdcMicros }]
      : [];
    return Promise.resolve({
      amount: this.algoMicros,
      minBalance: this.minBalanceMicros,
      assets,
    });
  };
}
