import algosdk from "algosdk";
import {
  buildOptInTxn,
  envKeyFor,
  isAccountRole,
  optInGate,
  roleNetworkGate,
  type AccountRole,
} from "./account-chain";
import { operatingAddress } from "../payments/wallet";
import { toolEnv } from "./account-env";
import { fail, parseCli, say } from "./cli";

const usage =
  "Usage: account:optin -- --role client|operator|testnet-target [--mainnet-i-have-approval]";

async function optIn(role: AccountRole, approvedMainnet: boolean): Promise<void> {
  const { network, mnemonicFor } = toolEnv(process.env);
  const gate = optInGate(network.name, approvedMainnet);
  if (!gate.ok) {
    fail(gate.message, usage);
    return;
  }
  const roleGate = roleNetworkGate(role, network.name);
  if (!roleGate.ok) {
    fail(roleGate.message, usage);
    return;
  }
  const mnemonic = mnemonicFor(role);
  if (mnemonic === undefined) {
    fail(`${envKeyFor(role)} is not set (run account:new -- --role ${role} first)`);
    return;
  }
  const address = operatingAddress(mnemonic);
  const assetId = network.network.usdcAssetId;
  const info = await network.algod.accountInformation(address).do();
  if (info.assets?.some((asset) => asset.assetId === BigInt(assetId)) === true) {
    say(`${role} ${address} is already opted in to ASA ${assetId} on ${network.name}`);
    return;
  }
  const params = await network.algod.getTransactionParams().do();
  const txn = buildOptInTxn(address, assetId, params);
  const account = algosdk.mnemonicToSecretKey(mnemonic);
  let signed: Awaited<ReturnType<typeof algosdk.signTransactionWithSigner>>;
  try {
    const signer = algosdk.makeBasicAccountTransactionSigner(account);
    signed = await algosdk.signTransactionWithSigner(txn, signer);
  } finally {
    account.sk.fill(0);
  }
  const { txid } = await network.algod.sendRawTransaction(signed.blob).do();
  say(`submitted opt-in ${txid} for ${address} to ASA ${assetId} on ${network.name}`);
  const confirmed = await algosdk.waitForConfirmation(network.algod, txid, 8);
  say(`confirmed in round ${String(confirmed.confirmedRound ?? "unknown")}`);
}

const values = parseCli({
  role: { type: "string" },
  "mainnet-i-have-approval": { type: "boolean", default: false },
});
if (values === null || !isAccountRole(values.role)) {
  fail("--role must be client, operator or testnet-target", usage);
} else {
  await optIn(values.role, values["mainnet-i-have-approval"]);
}
