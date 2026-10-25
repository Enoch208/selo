import {
  ALGORAND_MAINNET_GENESIS_HASH,
  ALGORAND_TESTNET_GENESIS_HASH,
  USDC_MAINNET_ASA_ID,
  USDC_TESTNET_ASA_ID,
} from "@x402/avm";
import type { Network } from "@x402/core/types";

export const merchantNetworkNames = ["algorand-testnet", "algorand-mainnet"] as const;
export type MerchantNetworkName = (typeof merchantNetworkNames)[number];

export interface MerchantNetwork {
  readonly caip2: Network;
  readonly usdcAssetId: string;
}

export const merchantNetworks: Readonly<Record<MerchantNetworkName, MerchantNetwork>> = {
  "algorand-testnet": {
    caip2: `algorand:${ALGORAND_TESTNET_GENESIS_HASH}`,
    usdcAssetId: USDC_TESTNET_ASA_ID,
  },
  "algorand-mainnet": {
    caip2: `algorand:${ALGORAND_MAINNET_GENESIS_HASH}`,
    usdcAssetId: USDC_MAINNET_ASA_ID,
  },
};
