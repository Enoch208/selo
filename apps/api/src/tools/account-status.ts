import { operatingAddress } from "../payments/wallet";
import { accountRoles, envKeyFor, holdingSummary } from "./account-chain";
import { toolEnv } from "./account-env";
import { say } from "./cli";

const { network, mnemonicFor } = toolEnv(process.env);
const assetId = network.network.usdcAssetId;
say(`network ${network.name} (${network.network.algodUrl}), USDC ASA ${assetId}`);
for (const role of accountRoles) {
  const mnemonic = mnemonicFor(role);
  if (mnemonic === undefined) {
    say(`${role}: ${envKeyFor(role)} not set`);
  } else {
    const address = operatingAddress(mnemonic);
    const summary = holdingSummary(await network.algod.accountInformation(address).do(), assetId);
    const usdc = summary.usdcOptedIn ? `${summary.usdc ?? "0.00"} USDC` : "not opted in to USDC";
    say(`${role}: ${address}`);
    say(`  ${summary.algo} ALGO (minimum balance ${summary.minBalanceAlgo}), ${usdc}`);
  }
}
