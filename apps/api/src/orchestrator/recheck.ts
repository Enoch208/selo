import { targetCovered } from "@selo/core";
import { currentAuthorization } from "../authorizations/store";
import { hasLapsed } from "../authorizations/view";
import type { TargetAuthorizationRow } from "../db/client";
import type { JobContext } from "./context";
import { evidenceFor } from "./evidence";
import type { Scenario } from "./scenario";

function snapshot(row: TargetAuthorizationRow) {
  return {
    id: row.id,
    type: row.authorizationType,
    status: row.status,
    origin: row.origin,
    routePath: row.routePath,
    method: row.httpMethod,
    verifiedAt: row.verifiedAt,
    expiresAt: row.expiresAt,
  };
}

export type RecheckStage = "run_start" | "before_replay";

export async function recheckAuthorization(
  ctx: JobContext,
  stage: RecheckStage,
  scenario: Scenario | null,
): Promise<boolean> {
  const checkedAt = new Date();
  const authorization = await currentAuthorization(
    ctx.db,
    ctx.preflight.authorizationId,
    checkedAt,
  );
  const covered = targetCovered(
    {
      origin: authorization.origin,
      routePath: authorization.routePath,
      method: authorization.httpMethod,
    },
    { origin: ctx.target.origin, path: ctx.target.path, method: ctx.method },
  );
  const valid =
    authorization.status === "VERIFIED" && !hasLapsed(authorization, checkedAt) && covered;
  await evidenceFor(ctx, scenario, "authorization_snapshot", {
    stage,
    authorization: snapshot(authorization),
    requested: { origin: ctx.target.origin, path: ctx.target.path, method: ctx.method },
    preflight: { id: ctx.preflight.id, targetUrl: ctx.preflight.targetUrl },
    covered,
    valid,
    checkedAt,
  });
  return valid;
}
