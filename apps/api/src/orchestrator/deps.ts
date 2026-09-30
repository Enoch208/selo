import type { SchemeNetworkClient } from "@x402/core/types";
import type { CatalogClient } from "../catalog/client";
import type { Db } from "../db/client";
import type { SafeFetchOptions } from "../net/safe-fetch";
import type { SeloNetwork } from "../payments/networks";
import type { FetchLike } from "../payments/transport";
import type { WalletBalance } from "../payments/wallet-balance";

export interface ReportConfig {
  readonly dir: string;
  readonly tokenSecret: string;
  readonly publicBaseUrl: string;
}

export interface RunnerDeps {
  readonly db: Db;
  readonly network: SeloNetwork;
  readonly scheme: SchemeNetworkClient;
  readonly targetFetch: (options: SafeFetchOptions) => FetchLike;
  readonly catalog: CatalogClient;
  readonly walletBalance: WalletBalance;
  readonly absoluteCapMicros: number;
  readonly wallClockMs: number;
  readonly reports: ReportConfig;
}

export const handshakeTimeoutMs = 10_000;
export const paidTimeoutMs = 20_000;
export const maxPaidBodyBytes = 256 * 1024;
export const bodyPreviewChars = 2_048;
