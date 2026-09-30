import { formatMicros } from "@selo/core";
import algosdk from "algosdk";
import { messageChain, withDeadline } from "./transport";

export interface AccountHoldings {
  readonly amount: bigint;
  readonly minBalance: bigint;
  readonly assets?: readonly { readonly assetId: bigint; readonly amount: bigint }[];
}

export interface WalletBalance {
  readonly read: () => Promise<AccountHoldings>;
}

export type FundingCheck =
  | { readonly kind: "funded" }
  | { readonly kind: "unfunded"; readonly detail: string }
  | { readonly kind: "unreachable"; readonly detail: string };

const walletReadTimeoutMs = 5_000;

export function createAlgodWalletBalance(algodUrl: string, address: string): WalletBalance {
  const algod = new algosdk.Algodv2("", algodUrl);
  return {
    read: () =>
      withDeadline(
        algod.accountInformation(address).do(),
        AbortSignal.timeout(walletReadTimeoutMs),
      ),
  };
}

const sixDecimals = (value: bigint): string => formatMicros(Number(value));

export function fundingShortfall(
  account: AccountHoldings,
  usdcAssetId: string,
  amountMicros: number,
): string | null {
  if (account.amount < account.minBalance) {
    return `ALGO balance ${sixDecimals(account.amount)} is below the ${sixDecimals(account.minBalance)} minimum balance`;
  }
  const holding = account.assets?.find((asset) => asset.assetId === BigInt(usdcAssetId));
  if (holding === undefined) {
    return `the operating wallet is not opted in to USDC ASA ${usdcAssetId}`;
  }
  if (holding.amount < BigInt(amountMicros)) {
    return `USDC balance ${sixDecimals(holding.amount)} is below the ${formatMicros(amountMicros)} payment`;
  }
  return null;
}

export async function checkFunding(
  wallet: WalletBalance,
  usdcAssetId: string,
  amountMicros: number,
): Promise<FundingCheck> {
  let account: AccountHoldings;
  try {
    account = await wallet.read();
  } catch (error: unknown) {
    return { kind: "unreachable", detail: `algod did not answer: ${messageChain(error)}` };
  }
  const shortfall = fundingShortfall(account, usdcAssetId, amountMicros);
  return shortfall === null ? { kind: "funded" } : { kind: "unfunded", detail: shortfall };
}
