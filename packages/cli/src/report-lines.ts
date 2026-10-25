import type { HttpMethod, PreflightEligible } from "@selo/core";
import { formatMicros } from "@selo/core";
import type { Conclusion } from "./conclude";
import type { Output } from "./exit";
import { statePath, type RunState } from "./state";
import { redactReportUrl } from "./summary";

interface Terms {
  readonly url: string;
  readonly method: HttpMethod;
  readonly release: string;
  readonly network: string;
  readonly maxPriceMicros: number;
}

const pad = (label: string): string => label.padEnd(10);

export function announceTerms(
  out: Output,
  terms: Terms,
  preflight: PreflightEligible,
  payer: string,
): void {
  out.line(`${pad("release")}${terms.release} (asserted by you, not verified by Selo)`);
  out.line(`${pad("target")}${terms.method} ${terms.url}`);
  out.line(`${pad("preflight")}${preflight.preflightId}, valid until ${preflight.expiresAt}`);
  out.line(
    `${pad("target fee")}${preflight.target.priceUsdc} USDC, paid by Selo from its own wallet`,
  );
  out.line(`${pad("Selo cap")}${preflight.estimatedMaxSpendUsdc} USDC at most spent on the target`);
  out.line(`${pad("you pay")}${preflight.seloPriceUsdc} USDC to Selo on ${terms.network}`);
  out.line(`${pad("budget")}${formatMicros(terms.maxPriceMicros)} USDC approved for this run`);
  out.line(`${pad("payer")}${payer}`);
}

export function printConclusion(out: Output, conclusion: Conclusion, path: string): void {
  const { report } = conclusion;
  if (report !== null) {
    out.line(`${pad("verdict")}${report.verdict}`);
    for (const check of report.checks) {
      out.line(`${pad("check")}${check.id.padEnd(20)}${check.status.padEnd(14)}${check.code}`);
    }
    for (const warning of report.warnings) {
      out.line(`${pad("warning")}${warning}`);
    }
    out.line(`${pad("job")}${report.jobId}`);
    out.line(`${pad("inbound")}${report.money.seloInboundTxId}`);
    out.line(`${pad("downstream")}${report.money.downstreamTxIds.join(", ") || "none"}`);
    out.line(
      `${pad("report")}${redactReportUrl(report.reportUrl)} (private link saved in ${path})`,
    );
  }
  out.line(
    `${pad("gate")}${conclusion.gate} (exit ${String(conclusion.exitCode)}): ${conclusion.reason}`,
  );
}

export function printRecovery(out: Output, state: RunState, stateDir: string): void {
  out.error(
    `release ${state.release} has an unconfirmed paid run (${state.phase}): ${state.message}`,
  );
  out.error("Do not start a new paid run for this release; that could pay a second time.");
  out.error(
    "Resume it instead: rerun the same selo test command with --resume. It reuses the same preflight and Idempotency-Key, and Selo never settles a duplicate.",
  );
  if (state.expectedInboundTxId !== null) {
    out.error(
      `Check the payer account for transaction ${state.expectedInboundTxId} on an Algorand explorer.`,
    );
  }
  out.error(`Run state: ${statePath(stateDir, state.release)}`);
}
