import type { AuthorizationStatus, AuthorizationView } from "@selo/core";
import type { TargetAuthorizationRow } from "../db/client";

export function hasLapsed(row: TargetAuthorizationRow, now: Date): boolean {
  const expiring: readonly AuthorizationStatus[] = ["PENDING", "VERIFIED"];
  return expiring.includes(row.status) && row.expiresAt.getTime() <= now.getTime();
}

export function toView(row: TargetAuthorizationRow): AuthorizationView {
  return {
    authorizationId: row.id,
    status: row.status,
    origin: row.origin,
    routePath: row.routePath,
    method: row.httpMethod,
    type: row.authorizationType,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
  };
}

const hourMs = 3_600_000;

export function expiryAfter(verifiedAt: Date, ttlHours: number): Date {
  return new Date(verifiedAt.getTime() + ttlHours * hourMs);
}
