import algosdk from "algosdk";
import { z } from "zod";
import { seloNetworks, type SeloNetwork, type SeloNetworkName } from "../payments/networks";
import { envKeyFor, type AccountRole } from "./account-chain";

const toolEnvSchema = z.object({
  SELO_NETWORK: z.enum(["algorand-mainnet", "algorand-testnet"]).default("algorand-testnet"),
  SELO_CLIENT_MNEMONIC: z.string().trim().min(1).optional(),
  SELO_OPERATOR_MNEMONIC: z.string().trim().min(1).optional(),
  SELO_TESTNET_TARGET_MNEMONIC: z.string().trim().min(1).optional(),
});

export interface ToolNetwork {
  readonly name: SeloNetworkName;
  readonly network: SeloNetwork;
  readonly algod: algosdk.Algodv2;
}

export function toolEnv(source: NodeJS.ProcessEnv) {
  const env = toolEnvSchema.parse(source);
  const network: ToolNetwork = {
    name: env.SELO_NETWORK,
    network: seloNetworks[env.SELO_NETWORK],
    algod: new algosdk.Algodv2("", seloNetworks[env.SELO_NETWORK].algodUrl),
  };
  const mnemonicFor = (role: AccountRole): string | undefined => env[envKeyFor(role)];
  return { network, mnemonicFor };
}
