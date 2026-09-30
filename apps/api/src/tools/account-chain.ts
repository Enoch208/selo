import { formatMicros } from "@selo/core";
import algosdk from "algosdk";
import type { SeloNetworkName } from "../payments/networks";
import type { AccountHoldings } from "../payments/wallet-balance";

export const accountRoles = ["client", "operator", "testnet-target"] as const;
export type AccountRole = (typeof accountRoles)[number];

export const isAccountRole = (value: string | undefined): value is AccountRole =>
  accountRoles.some((role) => role === value);

const envKeys = {
  client: "SELO_CLIENT_MNEMONIC",
  operator: "SELO_OPERATOR_MNEMONIC",
  "testnet-target": "SELO_TESTNET_TARGET_MNEMONIC",
} as const satisfies Record<AccountRole, string>;

export function envKeyFor(role: AccountRole): (typeof envKeys)[AccountRole] {
  return envKeys[role];
}

export function roleNetworkGate(
  role: AccountRole,
  network: SeloNetworkName,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  return role === "testnet-target" && network !== "algorand-testnet"
    ? { ok: false, message: "refusing: the testnet-target wallet is used on Algorand Testnet only" }
    : { ok: true };
}

export function optInGate(
  network: SeloNetworkName,
  approvedMainnet: boolean,
): { readonly ok: true } | { readonly ok: false; readonly message: string } {
  return network === "algorand-mainnet" && !approvedMainnet
    ? { ok: false, message: "refusing: Mainnet opt-in needs --mainnet-i-have-approval" }
    : { ok: true };
}

export function buildOptInTxn(
  address: string,
  assetId: string,
  suggestedParams: algosdk.SuggestedParams,
): algosdk.Transaction {
  return algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
    sender: address,
    receiver: address,
    amount: 0,
    assetIndex: BigInt(assetId),
    suggestedParams,
  });
}

export type { AccountHoldings } from "../payments/wallet-balance";

export interface HoldingSummary {
  readonly algo: string;
  readonly minBalanceAlgo: string;
  readonly usdcOptedIn: boolean;
  readonly usdc: string | null;
}

const sixDecimals = (value: bigint): string => formatMicros(Number(value));

export function holdingSummary(account: AccountHoldings, assetId: string): HoldingSummary {
  const holding = account.assets?.find((asset) => asset.assetId === BigInt(assetId));
  return {
    algo: sixDecimals(account.amount),
    minBalanceAlgo: sixDecimals(account.minBalance),
    usdcOptedIn: holding !== undefined,
    usdc: holding === undefined ? null : sixDecimals(holding.amount),
  };
}
