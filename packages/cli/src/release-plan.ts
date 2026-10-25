import { createHash } from "node:crypto";
import type { ExpectedContract, HttpMethod, JsonValue } from "@selo/core";
import type { SeloNetworkName } from "@selo/api/networks";
import type { PayFlowDeps } from "@selo/api/pay-flow";
import { requestPreflight } from "./api";
import { exitCodes, type ExitCode, type Output } from "./exit";
import type { CliFetch } from "./http";
import { announceTerms, printRecovery } from "./report-lines";
import { blocksNewPayment, loadState, type RunState } from "./state";

export interface ReleaseGateOptions {
  readonly api: string;
  readonly authorizationId: string;
  readonly url: string;
  readonly method: HttpMethod;
  readonly body: JsonValue | null;
  readonly contract: ExpectedContract;
  readonly release: string;
  readonly network: SeloNetworkName;
  readonly maxPriceMicros: number;
  readonly payTo: string | null;
  readonly approveMainnet: boolean;
  readonly resume: boolean;
  readonly summaryFile: string | null;
  readonly attestationFile: string | null;
}

export interface ReleaseGateDeps {
  readonly fetch: CliFetch;
  readonly schemeFor: PayFlowDeps["schemeFor"];
  readonly payer: string;
  readonly now: () => Date;
  readonly out: Output;
  readonly stateDir: string;
  readonly stepSummaryFile: string | null;
}

export interface Attempt {
  readonly preflightId: string;
  readonly idempotencyKey: string;
  readonly prior: RunState | null;
}

export type Planned =
  | { readonly kind: "attempt"; readonly attempt: Attempt }
  | { readonly kind: "exit"; readonly code: ExitCode };

const idempotencyKeyFor = (preflightId: string, payer: string): string =>
  `selo-cli-${createHash("sha256").update(`${preflightId}:${payer}`).digest("hex").slice(0, 48)}`;

function sameRun(prior: RunState, deps: ReleaseGateDeps, options: ReleaseGateOptions): boolean {
  return (
    prior.api === options.api &&
    prior.target.url === options.url &&
    prior.target.method === options.method &&
    prior.network === options.network &&
    prior.payer === deps.payer
  );
}

function planResume(
  deps: ReleaseGateDeps,
  options: ReleaseGateOptions,
  prior: RunState | null,
): Planned {
  if (prior === null) {
    deps.out.error(`nothing to resume: no earlier run is recorded for release ${options.release}`);
    return { kind: "exit", code: exitCodes.refused };
  }
  if (!sameRun(prior, deps, options)) {
    deps.out.error(
      "--resume must use the same --api, --url, --method, --network and payer as the run it resumes",
    );
    return { kind: "exit", code: exitCodes.refused };
  }
  if (!blocksNewPayment(prior.phase)) {
    deps.out.error(
      `the last run for release ${options.release} is already ${prior.phase}: ${prior.message}`,
    );
    return { kind: "exit", code: exitCodes.refused };
  }
  return {
    kind: "attempt",
    attempt: { preflightId: prior.preflightId, idempotencyKey: prior.idempotencyKey, prior },
  };
}

async function planFresh(deps: ReleaseGateDeps, options: ReleaseGateOptions): Promise<Planned> {
  const answer = await requestPreflight(deps.fetch, options.api, {
    authorizationId: options.authorizationId,
    targetUrl: options.url,
    method: options.method,
    ...(options.body === null ? {} : { requestBody: options.body }),
  });
  if (answer.kind === "unavailable") {
    deps.out.error(`preflight unavailable, nothing was paid: ${answer.message}`);
    return { kind: "exit", code: exitCodes.inconclusive };
  }
  if (answer.kind === "refused") {
    deps.out.error(`preflight refused, nothing was paid: ${answer.message}`);
    return { kind: "exit", code: exitCodes.refused };
  }
  if (answer.kind === "ineligible") {
    deps.out.error(
      `preflight ineligible (${answer.preflight.reason}), nothing was paid: ${answer.preflight.message}`,
    );
    return { kind: "exit", code: exitCodes.refused };
  }
  announceTerms(deps.out, options, answer.preflight, deps.payer);
  const { preflightId } = answer.preflight;
  return {
    kind: "attempt",
    attempt: {
      preflightId,
      idempotencyKey: idempotencyKeyFor(preflightId, deps.payer),
      prior: null,
    },
  };
}

export async function plan(deps: ReleaseGateDeps, options: ReleaseGateOptions): Promise<Planned> {
  const loaded = await loadState(deps.stateDir, options.release);
  if (loaded.kind === "unreadable") {
    deps.out.error(`the run state ${loaded.path} is unreadable; inspect it before paying again`);
    return { kind: "exit", code: exitCodes.inconclusive };
  }
  const prior = loaded.kind === "found" ? loaded.state : null;
  if (options.resume) {
    return planResume(deps, options, prior);
  }
  if (prior !== null && blocksNewPayment(prior.phase)) {
    printRecovery(deps.out, prior, deps.stateDir);
    return { kind: "exit", code: exitCodes.inconclusive };
  }
  return planFresh(deps, options);
}
