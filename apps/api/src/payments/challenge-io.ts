import { decodePaymentRequiredHeader, decodePaymentResponseHeader } from "@x402/core/http";
import { z } from "zod";

export interface ChallengeRead {
  readonly status: number;
  readonly decoded: unknown;
  readonly decodeFailed: boolean;
  readonly decodeError: string | null;
}

export interface SettlementRead {
  readonly txId: string | null;
  readonly malformed: boolean;
  readonly errorReason: string | null;
}

const settleResponseSchema = z.looseObject({
  success: z.boolean(),
  transaction: z.string(),
  errorReason: z.string().optional(),
});

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

type Decoded =
  { readonly ok: true; readonly value: unknown } | { readonly ok: false; readonly error: string };

function decodeWith(decode: (header: string) => unknown, header: string): Decoded {
  try {
    return { ok: true, value: decode(header) };
  } catch (error: unknown) {
    return { ok: false, error: messageOf(error) };
  }
}

export function readChallenge(response: Response): ChallengeRead {
  const header = response.headers.get("PAYMENT-REQUIRED");
  const base = { status: response.status, decoded: null, decodeFailed: false, decodeError: null };
  if (header === null) {
    return base;
  }
  const decoded = decodeWith(decodePaymentRequiredHeader, header);
  return decoded.ok
    ? { ...base, decoded: decoded.value }
    : { ...base, decodeFailed: true, decodeError: decoded.error };
}

export function readSettlementTxId(response: Response): SettlementRead {
  const header = response.headers.get("PAYMENT-RESPONSE");
  if (header === null) {
    return { txId: null, malformed: false, errorReason: null };
  }
  const decoded = decodeWith(decodePaymentResponseHeader, header);
  const settle = settleResponseSchema.safeParse(decoded.ok ? decoded.value : undefined);
  if (!settle.success) {
    return { txId: null, malformed: true, errorReason: null };
  }
  const settled = settle.data.success && settle.data.transaction !== "";
  return {
    txId: settled ? settle.data.transaction : null,
    malformed: false,
    errorReason: settle.data.errorReason ?? null,
  };
}
