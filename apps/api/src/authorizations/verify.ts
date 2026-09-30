import type { AuthorizationView } from "@selo/core";
import { and, eq, gt } from "drizzle-orm";
import type { Db, TargetAuthorizationRow } from "../db/client";
import { targetAuthorizations } from "../db/schema";
import { conflict, HttpError } from "../http/errors";
import { readLimitedText } from "../net/limited-body";
import { SafeFetchError } from "../net/safe-fetch";
import { carriesNonce, verificationUrl } from "./challenge";
import type { AuthorizationDeps } from "./deps";
import { currentAuthorization } from "./store";
import { expiryAfter, toView } from "./view";

const maxFileBytes = 4096;

const verificationFailed = (origin: string): HttpError =>
  conflict(
    "VERIFICATION_FAILED",
    `${verificationUrl(origin)} does not contain the expected selo-verification line`,
  );

const unreachable = (origin: string): HttpError =>
  new HttpError(502, "VERIFICATION_UNREACHABLE", `Could not reach ${verificationUrl(origin)}`);

function translateFetchFailure(error: unknown, origin: string): unknown {
  if (!(error instanceof SafeFetchError)) {
    return error;
  }
  if (error.failure.kind === "blocked") {
    return new HttpError(
      422,
      error.failure.reason,
      `Selo refused to fetch ${verificationUrl(origin)}`,
    );
  }
  return unreachable(origin);
}

function refuseUnverifiable(row: TargetAuthorizationRow): never {
  if (row.status === "REVOKED") {
    throw conflict("AUTHORIZATION_REVOKED", `Authorization ${row.id} was revoked`);
  }
  if (row.verifiedAt === null) {
    throw conflict("CHALLENGE_EXPIRED", "The verification challenge expired; create a new one");
  }
  throw conflict("AUTHORIZATION_EXPIRED", "The authorization expired; create a new one");
}

async function fetchVerificationFile(deps: AuthorizationDeps, origin: string): Promise<string> {
  const safeFetch = deps.verificationFetch(origin);
  const response = await safeFetch(verificationUrl(origin), {
    method: "GET",
    headers: { accept: "text/plain" },
  }).catch((error: unknown) => {
    throw translateFetchFailure(error, origin);
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw verificationFailed(origin);
  }
  const file = await readLimitedText(response, maxFileBytes);
  if (file.ok) {
    return file.text;
  }
  throw file.kind === "too_large" ? verificationFailed(origin) : unreachable(origin);
}

export async function verifyAuthorization(
  db: Db,
  deps: AuthorizationDeps,
  id: string,
): Promise<AuthorizationView> {
  const row = await currentAuthorization(db, id, new Date());
  if (row.status === "VERIFIED") {
    return toView(row);
  }
  if (row.status !== "PENDING" || row.verificationNonceHash === null) {
    return refuseUnverifiable(row);
  }
  const file = await fetchVerificationFile(deps, row.origin);
  if (!carriesNonce(file, row.verificationNonceHash)) {
    throw verificationFailed(row.origin);
  }
  const verifiedAt = new Date();
  const [updated] = await db
    .update(targetAuthorizations)
    .set({
      status: "VERIFIED",
      verifiedAt,
      expiresAt: expiryAfter(verifiedAt, deps.ttlHours),
    })
    .where(
      and(
        eq(targetAuthorizations.id, id),
        eq(targetAuthorizations.status, "PENDING"),
        gt(targetAuthorizations.expiresAt, verifiedAt),
      ),
    )
    .returning();
  if (updated !== undefined) {
    return toView(updated);
  }
  const latest = await currentAuthorization(db, id, verifiedAt);
  return latest.status === "VERIFIED" ? toView(latest) : refuseUnverifiable(latest);
}
