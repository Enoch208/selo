import type { PaymentPayload } from "@x402/core/types";
import algosdk from "algosdk";
import { z } from "zod";

export interface ExpectedTxId {
  readonly expectedTxId: string | null;
  readonly expectedTxIdUnavailable: boolean;
  readonly lastValidRound: number | null;
}

const avmPaymentGroup = z.object({
  paymentGroup: z.array(z.string()).min(1),
  paymentIndex: z.number().int().nonnegative(),
});

const unavailable: ExpectedTxId = {
  expectedTxId: null,
  expectedTxIdUnavailable: true,
  lastValidRound: null,
};

interface SignedTransfer {
  readonly txId: string;
  readonly lastValid: bigint;
}

function signedTransferOf(entry: string): SignedTransfer | null {
  try {
    const { txn } = algosdk.decodeSignedTransaction(Buffer.from(entry, "base64"));
    return { txId: txn.txID(), lastValid: txn.lastValid };
  } catch {
    return null;
  }
}

function roundOf(round: bigint): number | null {
  const value = Number(round);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

export function expectedTxIdOf(payload: PaymentPayload): ExpectedTxId {
  const group = avmPaymentGroup.safeParse(payload.payload);
  if (!group.success) {
    return unavailable;
  }
  const entry = group.data.paymentGroup[group.data.paymentIndex];
  const transfer = entry === undefined ? null : signedTransferOf(entry);
  if (transfer === null) {
    return unavailable;
  }
  return {
    expectedTxId: transfer.txId,
    expectedTxIdUnavailable: false,
    lastValidRound: roundOf(transfer.lastValid),
  };
}
