import { eq } from "drizzle-orm";
import type { Db, PreflightRow } from "../db/client";
import { currentAuthorization } from "../authorizations/store";
import { preflights } from "../db/schema";
import { HttpError } from "../http/errors";
import { isId } from "../ids";

export async function payablePreflight(
  db: Db,
  preflightId: string,
  jobMaxSpendMicros: number,
  now: Date,
): Promise<PreflightRow> {
  const [preflight] = isId("pfl", preflightId)
    ? await db.select().from(preflights).where(eq(preflights.id, preflightId))
    : [];
  if (preflight === undefined) {
    throw new HttpError(404, "PREFLIGHT_NOT_FOUND", `Preflight ${preflightId} does not exist`);
  }
  if (!preflight.eligible) {
    throw new HttpError(
      422,
      "PREFLIGHT_INELIGIBLE",
      `Preflight ${preflightId} is not eligible (${preflight.rejectionReason ?? "unknown reason"})`,
    );
  }
  if (preflight.expiresAt.getTime() <= now.getTime()) {
    throw new HttpError(
      409,
      "PREFLIGHT_EXPIRED",
      `Preflight ${preflightId} has expired; run a new preflight`,
    );
  }
  const authorization = await currentAuthorization(db, preflight.authorizationId, now);
  if (authorization.status !== "VERIFIED") {
    throw new HttpError(
      403,
      "AUTHORIZATION_INVALID",
      `Authorization ${authorization.id} is not a verified, unexpired authorization for this target`,
    );
  }
  if ((preflight.paymentAmountMicros ?? Number.POSITIVE_INFINITY) > jobMaxSpendMicros) {
    throw new HttpError(
      422,
      "PRICE_OVER_BUDGET",
      "The target price exceeds the per-job downstream spend limit",
    );
  }
  return preflight;
}
