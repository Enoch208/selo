export const payerSideReasons: ReadonlySet<string> = new Set([
  "invalid_exact_avm_simulation_failed",
  "invalid_exact_avm_payment_not_signed",
  "invalid_exact_avm_invalid_signature",
  "insufficient_funds",
]);

const payerSidePattern =
  /\binsufficient\b|\boverspend\b|\bmin(imum)?[ _-]balance\b|\bopt(ed)?[ _-]?in\b/i;

function challengeError(decoded: unknown): string | null {
  if (typeof decoded !== "object" || decoded === null || !("error" in decoded)) {
    return null;
  }
  return typeof decoded.error === "string" && decoded.error !== "" ? decoded.error : null;
}

export function rejectionReasons(errorReason: string | null, decoded: unknown): readonly string[] {
  return [errorReason, challengeError(decoded)].filter(
    (reason): reason is string => reason !== null && reason !== "",
  );
}

export function payerSideReason(errorReason: string | null, decoded: unknown): string | null {
  return (
    rejectionReasons(errorReason, decoded).find(
      (reason) => payerSideReasons.has(reason) || payerSidePattern.test(reason),
    ) ?? null
  );
}
