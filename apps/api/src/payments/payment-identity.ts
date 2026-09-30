import type { PaymentRequired } from "@x402/core/types";
import {
  appendPaymentIdentifierToExtensions,
  isPaymentIdentifierExtension,
  PAYMENT_ID_MAX_LENGTH,
  PAYMENT_ID_MIN_LENGTH,
  PAYMENT_IDENTIFIER,
} from "@x402/extensions/payment-identifier";

export function paymentIdFor(operationId: string): string {
  const safe = `selo_${operationId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  return safe.padEnd(PAYMENT_ID_MIN_LENGTH, "0").slice(0, PAYMENT_ID_MAX_LENGTH);
}

export function withPaymentIdentity(
  paymentRequired: PaymentRequired,
  operationId: string,
): PaymentRequired {
  const extensions = paymentRequired.extensions;
  if (extensions === undefined || !isPaymentIdentifierExtension(extensions[PAYMENT_IDENTIFIER])) {
    return paymentRequired;
  }
  return {
    ...paymentRequired,
    extensions: appendPaymentIdentifierToExtensions(
      structuredClone(extensions),
      paymentIdFor(operationId),
    ),
  };
}
