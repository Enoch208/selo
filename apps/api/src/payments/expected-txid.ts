import type { PaymentPayload } from "@x402/core/types";
import algosdk from "algosdk";
import { z } from "zod";

export interface ExpectedTxId {
  readonly expectedTxId: string | null;
  readonly expectedTxIdUnavailable: boolean;
}

const avmPaymentGroup = z.object({
  paymentGroup: z.array(z.string()).min(1),
  paymentIndex: z.number().int().nonnegative(),
});

const unavailable: ExpectedTxId = { expectedTxId: null, expectedTxIdUnavailable: true };

function signedTxIdOf(entry: string): string | null {
  try {
    return algosdk.decodeSignedTransaction(Buffer.from(entry, "base64")).txn.txID();
  } catch {
    return null;
  }
}

export function expectedTxIdOf(payload: PaymentPayload): ExpectedTxId {
  const group = avmPaymentGroup.safeParse(payload.payload);
  if (!group.success) {
    return unavailable;
  }
  const entry = group.data.paymentGroup[group.data.paymentIndex];
  const txId = entry === undefined ? null : signedTxIdOf(entry);
  return txId === null ? unavailable : { expectedTxId: txId, expectedTxIdUnavailable: false };
}
