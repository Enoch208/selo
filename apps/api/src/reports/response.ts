import type { ReleaseReport, ReleaseTestResponse } from "@selo/core";

export class ReportNotFinished extends Error {
  override readonly name = "ReportNotFinished";
}

export function toReleaseTestResponse(
  report: ReleaseReport,
  reportUrl: string,
): ReleaseTestResponse {
  if (report.verdict === null) {
    throw new ReportNotFinished(`Release job ${report.jobId} has no verdict yet`);
  }
  return {
    jobId: report.jobId,
    verdict: report.verdict,
    target: report.target.url,
    checks: report.checks,
    warnings: report.warnings,
    inconclusiveReason: report.inconclusiveReason,
    money: {
      seloInboundTxId: report.money.inboundTxId ?? "",
      downstreamSpendUsdc: report.money.downstreamSpendUsdc,
      downstreamTxIds: report.money.downstreamTxIds,
    },
    reportUrl,
  };
}
