import type { CheckId } from "@selo/core";

export interface CheckCopy {
  readonly code: string;
  readonly name: string;
  readonly proves: string;
}

export const checkCopy: Readonly<Record<CheckId, CheckCopy>> = {
  handshake: {
    code: "C1",
    name: "Handshake",
    proves: "The unpaid request returns a valid x402 v2 402 with an Algorand USDC requirement.",
  },
  paid_delivery: {
    code: "C2",
    name: "Paid delivery",
    proves: "Selo's payment settled with the tx it signed and the paid resource came back.",
  },
  response_contract: {
    code: "C4",
    name: "Response contract",
    proves: "Status, content type and optional JSON Schema match what you expect.",
  },
  discovery_contract: {
    code: "C5",
    name: "Discovery contract",
    proves: "The live 402 and the Bazaar listing agree on method, URL, terms and price.",
  },
  retry_safety: {
    code: "C3",
    name: "Retry / replay",
    proves: "Replaying the same signed payment is rejected or recognised, never charged twice.",
  },
};

export const checkOrder: readonly CheckId[] = [
  "handshake",
  "paid_delivery",
  "response_contract",
  "discovery_contract",
  "retry_safety",
];
