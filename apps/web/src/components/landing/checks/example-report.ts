import type { CheckId, CheckStatus } from "@selo/core";

export interface ExampleCheck {
  readonly id: CheckId;
  readonly status: CheckStatus;
  readonly note: string;
}

export const exampleChecks: readonly ExampleCheck[] = [
  { id: "handshake", status: "PASS", note: "402 with Algorand USDC" },
  { id: "paid_delivery", status: "PASS", note: "Settled, resource returned" },
  { id: "response_contract", status: "FAIL", note: "Expected JSON, got HTML" },
  { id: "discovery_contract", status: "WARN", note: "Not in Bazaar yet" },
  { id: "retry_safety", status: "INCONCLUSIVE", note: "Replay outcome unclear" },
];
