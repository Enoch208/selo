import { createHash } from "node:crypto";
import type { ExpectedContract, HttpMethod, JsonValue } from "@selo/core";
import type { SeloNetworkName } from "@selo/api/networks";
import { runPayment, type PayFlowDeps } from "@selo/api/pay-flow";
import { requestPreflight } from "./api";
import { conclude, type Conclusion } from "./conclude";
import { exitCodes, type ExitCode, type Output } from "./exit";
import type { CliFetch } from "./http";
import { announceTerms, printConclusion, printRecovery } from "./report-lines";
import { blocksNewPayment, loadState, saveState, type RunState } from "./state";
import { appendStepSummary, gateSummary, writeSummaryFile } from "./summary";

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

interface Attempt {
  readonly preflightId: string;
  readonly idempotencyKey: string;
  readonly prior: RunState | null;
}

type Planned =
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

async function plan(deps: ReleaseGateDeps, options: ReleaseGateOptions): Promise<Planned> {
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

function stateOf(
  deps: ReleaseGateDeps,
  options: ReleaseGateOptions,
  attempt: Attempt,
  conclusion: Pick<Conclusion, "phase" | "reason" | "report" | "expectedInboundTxId">,
): RunState {
  return {
    schema: "selo.cli.run.v1",
    release: options.release,
    api: options.api,
    target: { url: options.url, method: options.method },
    network: options.network,
    payer: deps.payer,
    preflightId: attempt.preflightId,
    idempotencyKey: attempt.idempotencyKey,
    phase: conclusion.phase,
    message: conclusion.reason,
    expectedInboundTxId: attempt.prior?.expectedInboundTxId ?? conclusion.expectedInboundTxId,
    jobId: conclusion.report?.jobId ?? null,
    verdict: conclusion.report?.verdict ?? null,
    reportUrl: conclusion.report?.reportUrl ?? null,
    updatedAt: deps.now().toISOString(),
  };
}

async function pay(
  deps: ReleaseGateDeps,
  options: ReleaseGateOptions,
  attempt: Attempt,
): Promise<Conclusion> {
  const before = {
    phase: "paying",
    reason: "the paid request is being sent",
    report: null,
    expectedInboundTxId: null,
  } as const;
  await saveState(deps.stateDir, stateOf(deps, options, attempt, before));
  const outcome = await runPayment(
    {
      fetch: deps.fetch,
      payer: deps.payer,
      seloWallets: [],
      schemeFor: deps.schemeFor,
      now: deps.now,
      write: deps.out.line,
    },
    {
      api: options.api,
      preflightId: attempt.preflightId,
      expected: options.contract,
      expectedNetwork: options.network,
      maxPriceMicros: options.maxPriceMicros,
      approvedMainnet: options.approveMainnet,
      expectedPayTo: options.payTo,
      idempotencyKey: attempt.idempotencyKey,
    },
  );
  return conclude(outcome, attempt.prior !== null);
}

export async function runReleaseGate(
  deps: ReleaseGateDeps,
  options: ReleaseGateOptions,
): Promise<ExitCode> {
  const planned = await plan(deps, options);
  if (planned.kind === "exit") {
    return planned.code;
  }
  const { attempt } = planned;
  const conclusion = await pay(deps, options, attempt);
  const state = stateOf(deps, options, attempt, conclusion);
  const statePath = await saveState(deps.stateDir, state);
  printConclusion(deps.out, conclusion, statePath);
  if (conclusion.phase === "unresolved") {
    printRecovery(deps.out, state, deps.stateDir);
  }
  const summary = gateSummary({
    ...options,
    target: { url: options.url, method: options.method },
    ...conclusion,
    decidedAt: deps.now(),
  });
  if (options.summaryFile !== null) {
    await writeSummaryFile(options.summaryFile, summary);
  }
  if (deps.stepSummaryFile !== null) {
    await appendStepSummary(deps.stepSummaryFile, summary);
  }
  return conclusion.exitCode;
}
