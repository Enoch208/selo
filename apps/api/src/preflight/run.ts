import { targetCovered, type PreflightRejection } from "@selo/core";
import type { Db, PreflightRow, TargetAuthorizationRow } from "../db/client";
import { currentAuthorization } from "../authorizations/store";
import { hasLapsed } from "../authorizations/view";
import { HttpError } from "../http/errors";
import { isId, newId } from "../ids";
import { parseTarget, type Target } from "../net/target";
import { assessChallenge, recorded, type Assessment, type RecordedJson } from "./assess";
import type { PreflightDeps } from "./deps";
import { probeTarget } from "./probe";
import type { PreflightInput } from "./schemas";
import { insertPreflight, type PreflightRecord } from "./store";

export type PreflightRun =
  | { readonly kind: "stored"; readonly row: PreflightRow }
  | { readonly kind: "refused"; readonly reason: PreflightRejection };

const minuteMs = 60_000;

async function authorizationFor(
  db: Db,
  id: string,
  now: Date,
): Promise<TargetAuthorizationRow | null> {
  if (!isId("auth", id)) {
    return null;
  }
  try {
    return await currentAuthorization(db, id, now);
  } catch (error: unknown) {
    if (error instanceof HttpError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

function authorizationRejection(
  authorization: TargetAuthorizationRow,
  target: Target,
  input: PreflightInput,
  now: Date,
): PreflightRejection | null {
  if (authorization.status !== "VERIFIED" || hasLapsed(authorization, now)) {
    return "AUTHORIZATION_EXPIRED";
  }
  const covered = targetCovered(
    {
      origin: authorization.origin,
      routePath: authorization.routePath,
      method: authorization.httpMethod,
    },
    { origin: target.origin, path: target.path, method: input.method },
  );
  return covered ? null : "AUTHORIZATION_MISSING";
}

async function probeAndAssess(
  deps: PreflightDeps,
  target: Target,
  input: PreflightInput,
  id: string,
): Promise<Assessment> {
  const outcome = await probeTarget(deps.probeFetch(target.origin), {
    url: target.href,
    method: input.method,
    operationId: `preflight-${id}`,
    body: input.requestBody,
  });
  if (outcome.kind === "blocked") {
    return {
      eligible: false,
      reason: "TARGET_ADDRESS_BLOCKED",
      requirement: null,
      challenge: null,
    };
  }
  if (outcome.kind !== "response") {
    return { eligible: false, reason: "TARGET_UNREACHABLE", requirement: null, challenge: null };
  }
  const policy = { network: deps.network.caip2, asset: deps.network.usdcAssetId };
  return assessChallenge(outcome.challenge, policy, deps.jobMaxSpendMicros);
}

async function catalogSnapshot(
  deps: PreflightDeps,
  target: Target,
  input: PreflightInput,
): Promise<RecordedJson | null> {
  for (const resourceUrl of new Set([input.targetUrl, target.href])) {
    const lookup = await deps.catalog.find(resourceUrl, input.method);
    if (lookup.kind === "found") {
      return recorded(lookup.record);
    }
    if (lookup.kind === "unavailable") {
      return null;
    }
  }
  return null;
}

export async function runPreflight(
  db: Db,
  deps: PreflightDeps,
  input: PreflightInput,
): Promise<PreflightRun> {
  const parsed = parseTarget(input.targetUrl);
  if (!parsed.ok) {
    return { kind: "refused", reason: parsed.reason };
  }
  const { target } = parsed;
  const now = new Date();
  const authorization = await authorizationFor(db, input.authorizationId, now);
  if (authorization === null) {
    return { kind: "refused", reason: "AUTHORIZATION_MISSING" };
  }
  const id = newId("pfl");
  const base = {
    id,
    authorizationId: authorization.id,
    targetUrl: target.href,
    method: input.method,
    requestBody: input.requestBody,
    expiresAt: new Date(now.getTime() + deps.ttlMinutes * minuteMs),
  };
  const store = (fields: Omit<PreflightRecord, keyof typeof base>) =>
    insertPreflight(db, { ...base, ...fields }).then((row) => ({ kind: "stored" as const, row }));
  const unprobed = authorizationRejection(authorization, target, input, now);
  if (unprobed !== null) {
    return store({ reason: unprobed, requirement: null, challenge: null, discovery: null });
  }
  const assessment = await probeAndAssess(deps, target, input, id);
  const { requirement, challenge } = assessment;
  if (!assessment.eligible) {
    return store({ reason: assessment.reason, requirement, challenge, discovery: null });
  }
  const discovery = await catalogSnapshot(deps, target, input);
  return store({ reason: null, requirement, challenge, discovery });
}
