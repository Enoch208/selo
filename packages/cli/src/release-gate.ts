import { runPayment } from "@selo/api/pay-flow";
import { conclude, type Conclusion } from "./conclude";
import type { ExitCode } from "./exit";
import { printConclusion, printRecovery } from "./report-lines";
import { plan, type Attempt, type ReleaseGateDeps, type ReleaseGateOptions } from "./release-plan";
import { saveState, type RunState } from "./state";
import { appendStepSummary, gateSummary, saveAttestation, writeSummaryFile } from "./summary";

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
      deploymentId: options.release,
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
  if (options.attestationFile !== null) {
    await saveAttestation(deps.out, options.attestationFile, conclusion.report?.attestation);
  }
  return conclusion.exitCode;
}
