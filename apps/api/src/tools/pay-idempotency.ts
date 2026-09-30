import { sha256Hex } from "../ids";
import { idempotencyKeyPattern } from "../release/request";

export function payIdempotencyKey(
  preflightId: string,
  payer: string,
  explicit: string | undefined,
): string | null {
  if (explicit !== undefined) {
    return idempotencyKeyPattern.test(explicit) ? explicit : null;
  }
  return `pay-selo-${sha256Hex(`${preflightId}:${payer}`).slice(0, 48)}`;
}
