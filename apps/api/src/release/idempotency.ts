import type { PaymentPayload } from "@x402/core/types";
import { sha256Hex } from "../ids";

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function releaseIdempotencyKey(
  preflightId: string,
  headerKey: string | null,
  payment: PaymentPayload,
): string {
  return headerKey === null
    ? sha256Hex(`pay:${canonicalJson(payment)}`)
    : sha256Hex(`hdr:${preflightId}:${headerKey}`);
}
