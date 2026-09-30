import {
  formatMicros,
  type PreflightEligible,
  type PreflightIneligible,
  type PreflightRejection,
  type PreflightResponse,
} from "@selo/core";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { PreflightRow } from "../db/client";

const messages: Readonly<Record<PreflightRejection, string>> = {
  AUTHORIZATION_MISSING: "No verified authorization covers this target origin, route and method",
  AUTHORIZATION_EXPIRED: "The authorization is not verified or has expired; verify it again",
  TARGET_URL_INVALID: "The target URL is not a valid absolute URL",
  TARGET_NOT_HTTPS: "Only https targets can be tested",
  TARGET_ADDRESS_BLOCKED: "The target must be a public hostname on the default https port",
  METHOD_NOT_ALLOWED: "The method is not allowed for this target",
  TARGET_UNREACHABLE: "The target could not be reached or answered with a server error",
  NO_PAYMENT_CHALLENGE: "The target did not answer the unpaid request with a valid x402 challenge",
  NETWORK_NOT_SUPPORTED: "The target offers no exact payment on the Algorand network Selo pays on",
  ASSET_NOT_SUPPORTED: "The target offers no exact payment in USDC on the Algorand network",
  PRICE_OVER_BUDGET: "The target price exceeds the per-job downstream spend limit",
};

export function ineligible(
  reason: PreflightRejection,
  preflightId: string | null,
): PreflightIneligible {
  return { eligible: false, preflightId, reason, message: messages[reason] };
}

export function rejectionStatus(reason: PreflightRejection): ContentfulStatusCode {
  if (reason === "AUTHORIZATION_MISSING" || reason === "AUTHORIZATION_EXPIRED") {
    return 403;
  }
  if (reason === "TARGET_URL_INVALID" || reason === "TARGET_NOT_HTTPS") {
    return 400;
  }
  return 422;
}

function eligibleView(row: PreflightRow, seloPriceMicros: number): PreflightEligible | null {
  if (row.paymentAmountMicros === null) {
    return null;
  }
  const price = formatMicros(row.paymentAmountMicros);
  return {
    eligible: true,
    preflightId: row.id,
    target: { url: row.targetUrl, method: row.httpMethod, priceUsdc: price },
    estimatedMaxSpendUsdc: price,
    seloPriceUsdc: formatMicros(seloPriceMicros),
    expiresAt: row.expiresAt.toISOString(),
  };
}

export function toResponse(row: PreflightRow, seloPriceMicros: number): PreflightResponse {
  const eligible = row.eligible ? eligibleView(row, seloPriceMicros) : null;
  if (eligible !== null) {
    return eligible;
  }
  if (row.rejectionReason === null) {
    throw new Error(`Preflight ${row.id} is neither eligible nor carries a rejection reason`);
  }
  return ineligible(row.rejectionReason, row.id);
}
