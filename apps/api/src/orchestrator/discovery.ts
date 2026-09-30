import {
  bazaarInfo,
  evaluateDiscovery,
  parseChallenge,
  type AlgorandRequirement,
  type LiveResource,
} from "@selo/core";
import type { CatalogLookup } from "../catalog/client";
import { clockExpired, type JobContext } from "./context";
import { evidenceFor } from "./evidence";
import type { Handshake } from "./handshake";
import { skipScenario } from "./skip";

const wallClockExpired: CatalogLookup = { kind: "unavailable", message: "job wall clock expired" };

function lookupBefore(
  pending: Promise<CatalogLookup>,
  signal: AbortSignal,
): Promise<CatalogLookup> {
  return new Promise<CatalogLookup>((resolve, reject) => {
    const onAbort = (): void => {
      resolve(wallClockExpired);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    pending.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

function live(decoded: unknown): {
  readonly info: unknown;
  readonly resource: LiveResource | null;
} {
  const parsed = parseChallenge(decoded);
  if (!parsed.ok) {
    return { info: undefined, resource: null };
  }
  const resource = parsed.challenge.resource;
  return {
    info: bazaarInfo(parsed.challenge),
    resource:
      resource === undefined
        ? null
        : {
            ...(resource.description === undefined ? {} : { description: resource.description }),
            ...(resource.mimeType === undefined ? {} : { mimeType: resource.mimeType }),
          },
  };
}

export async function runDiscovery(
  ctx: JobContext,
  handshake: Handshake,
  requirement: AlgorandRequirement,
): Promise<void> {
  const scenario = ctx.scenarios.discovery_contract;
  if (clockExpired(ctx)) {
    await skipScenario(ctx, scenario, "TARGET_TIMEOUT");
    return;
  }
  await scenario.advance("POLICY_CHECKED");
  await scenario.advance("REQUESTING");
  await scenario.attempt();
  const lookup = await lookupBefore(ctx.deps.catalog.find(ctx.target.href, ctx.method), ctx.signal);
  const { info, resource } = live(handshake.decoded);
  const result = evaluateDiscovery({
    target: { url: ctx.target.href, method: ctx.method },
    requirement,
    liveInfo: info,
    liveResource: resource,
    catalog: lookup,
    evidence: [],
  });
  if (result.status === "INCONCLUSIVE") {
    ctx.state.inconclusive(clockExpired(ctx) ? "TARGET_TIMEOUT" : "FACILITATOR_UNAVAILABLE");
  }
  const evidenceId = await evidenceFor(ctx, scenario, "catalog_record", {
    resourceUrl: ctx.target.href,
    method: ctx.method,
    lookup: lookup.kind,
    record: lookup.kind === "found" ? lookup.record : null,
    message: lookup.kind === "unavailable" ? lookup.message : null,
    liveInfo: info ?? null,
    code: result.code,
  });
  const check = ctx.state.record({ ...result, evidence: [evidenceId] });
  await scenario.evaluate(check, { lookup: lookup.kind, code: check.code });
}
