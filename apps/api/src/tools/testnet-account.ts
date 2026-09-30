import { fileURLToPath } from "node:url";
import algosdk from "algosdk";
import { seloNetworks } from "../payments/networks";
import { envKeyFor, isAccountRole, type AccountRole } from "./account-chain";
import { addEnvKeyIfAbsent } from "./env-file";
import { fail, parseCli, say } from "./cli";

const usage = "Usage: account:new -- --role client|operator|testnet-target";
const envPath = fileURLToPath(new URL("../../.env", import.meta.url));

async function create(role: AccountRole): Promise<void> {
  const key = envKeyFor(role);
  const account = algosdk.generateAccount();
  const outcome = await addEnvKeyIfAbsent(envPath, key, algosdk.secretKeyToMnemonic(account.sk));
  account.sk.fill(0);
  if (outcome === "present") {
    fail(`${key} is already set in ${envPath}; nothing was changed`);
    return;
  }
  const testnetUsdc = seloNetworks["algorand-testnet"].usdcAssetId;
  say(`${role} address: ${account.addr.toString()}`);
  say(`the recovery words were written to ${envPath} as ${key} (mode 0600)`);
  say("to use it on Algorand Testnet:");
  say("  1. fund ALGO at https://bank.testnet.algorand.network/");
  say(
    `  2. opt in to USDC (ASA ${testnetUsdc}): pnpm --filter @selo/api account:optin -- --role ${role}`,
  );
  say("  3. get Testnet USDC on Algorand at https://faucet.circle.com/");
  say("  4. check it: pnpm --filter @selo/api account:status");
}

const values = parseCli({ role: { type: "string" } });
if (values === null || !isAccountRole(values.role)) {
  fail("--role must be client, operator or testnet-target", usage);
} else {
  await create(values.role);
}
