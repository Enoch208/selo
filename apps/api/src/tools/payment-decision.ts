import { formatMicros } from "@selo/core";
import { seloNetworks, type SeloNetworkName } from "../payments/networks";

export const priceCeilingMicros = 5_000_000;

export type RefusalReason =
  | "unknown_network"
  | "network_mismatch"
  | "self_payment"
  | "mainnet_not_approved"
  | "pay_to_unconfirmed"
  | "pay_to_mismatch"
  | "price_out_of_bounds"
  | "over_budget";

export type PaymentDecision =
  | { readonly kind: "allow"; readonly network: SeloNetworkName }
  | { readonly kind: "refuse"; readonly reason: RefusalReason; readonly message: string };

export interface PaymentDecisionInput {
  readonly network: string;
  readonly expectedNetwork: SeloNetworkName | null;
  readonly payer: string;
  readonly payTo: string;
  readonly approvedMainnet: boolean;
  readonly amountMicros: number;
  readonly maxPriceMicros: number;
  readonly expectedPayTo: string | null;
  readonly seloWallets?: readonly string[];
}

const names: readonly SeloNetworkName[] = ["algorand-mainnet", "algorand-testnet"];

export function networkNameOf(caip2: string): SeloNetworkName | null {
  return names.find((name) => seloNetworks[name].caip2 === caip2) ?? null;
}

const refuse = (reason: RefusalReason, message: string): PaymentDecision => ({
  kind: "refuse",
  reason,
  message,
});

export function paymentDecision(input: PaymentDecisionInput): PaymentDecision {
  const network = networkNameOf(input.network);
  if (network === null) {
    return refuse(
      "unknown_network",
      `refusing: ${input.network} is not Algorand Mainnet or Testnet`,
    );
  }
  if (input.expectedNetwork !== null && input.expectedNetwork !== network) {
    return refuse(
      "network_mismatch",
      `refusing: the 402 asks for payment on ${network}, not the expected ${input.expectedNetwork}`,
    );
  }
  if (input.payer === input.payTo) {
    return refuse("self_payment", "refusing: the payer is the payTo address (self-payment)");
  }
  if (input.seloWallets?.includes(input.payer) === true) {
    return refuse("self_payment", "refusing: the payer is Selo's own wallet (self-payment)");
  }
  if (network === "algorand-mainnet" && !input.approvedMainnet) {
    return refuse(
      "mainnet_not_approved",
      "refusing: Mainnet payment needs --mainnet-i-have-approval from the wallet owner",
    );
  }
  if (network === "algorand-mainnet" && input.expectedPayTo === null) {
    return refuse(
      "pay_to_unconfirmed",
      "refusing: a Mainnet payment needs --pay-to <address> naming the expected payTo",
    );
  }
  if (input.expectedPayTo !== null && input.expectedPayTo !== input.payTo) {
    return refuse(
      "pay_to_mismatch",
      `refusing: the 402 names payTo ${input.payTo}, not the expected ${input.expectedPayTo}`,
    );
  }
  const amount = input.amountMicros;
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > priceCeilingMicros) {
    return refuse("price_out_of_bounds", "refusing: the price is not between 0 and 5.00 USDC");
  }
  if (amount > input.maxPriceMicros) {
    return refuse(
      "over_budget",
      `refusing: the price ${formatMicros(amount)} USDC is above the approved budget of ${formatMicros(input.maxPriceMicros)} USDC`,
    );
  }
  return { kind: "allow", network };
}
