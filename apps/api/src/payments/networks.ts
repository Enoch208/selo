import {
  ALGORAND_MAINNET_GENESIS_HASH,
  ALGORAND_TESTNET_GENESIS_HASH,
  USDC_MAINNET_ASA_ID,
  USDC_TESTNET_ASA_ID,
} from "@x402/avm";
import type { Network } from "@x402/core/types";

export type SeloNetworkName = "algorand-mainnet" | "algorand-testnet";

export interface SeloNetwork {
  readonly caip2: Network;
  readonly usdcAssetId: string;
  readonly algodUrl: string;
}

export const seloNetworks: Readonly<Record<SeloNetworkName, SeloNetwork>> = {
  "algorand-mainnet": {
    caip2: `algorand:${ALGORAND_MAINNET_GENESIS_HASH}`,
    usdcAssetId: USDC_MAINNET_ASA_ID,
    algodUrl: "https://mainnet-api.algonode.cloud",
  },
  "algorand-testnet": {
    caip2: `algorand:${ALGORAND_TESTNET_GENESIS_HASH}`,
    usdcAssetId: USDC_TESTNET_ASA_ID,
    algodUrl: "https://testnet-api.algonode.cloud",
  },
};
