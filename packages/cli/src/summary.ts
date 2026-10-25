import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  ReleaseAttestation,
  CheckStatus,
  HttpMethod,
  InconclusiveReason,
  ReleaseTestResponse,
  Verdict,
} from "@selo/core";
import type { Gate } from "./gate";

export function redactReportUrl(reportUrl: string): string {
  if (!URL.canParse(reportUrl)) {
    return "<private report link>";
  }
  const url = new URL(reportUrl);
  const segments = url.pathname.split("/");
  segments[segments.length - 1] = "<private>";
  return `${url.origin}${segments.join("/")}`;
}

export interface GateSummary {
  readonly schema: "selo.gate.v1";
  readonly release: { readonly id: string; readonly verification: "asserted_by_client" };
  readonly target: { readonly url: string; readonly method: HttpMethod };
  readonly network: string;
  readonly gate: Gate;
  readonly exitCode: number;
  readonly reason: string;
  readonly verdict: Verdict | null;
  readonly inconclusiveReason: InconclusiveReason | null;
  readonly checks: readonly {
    readonly id: string;
    readonly status: CheckStatus;
    readonly code: string;
    readonly summary: string;
  }[];
  readonly warnings: readonly string[];
  readonly money: {
    readonly seloInboundTxId: string | null;
    readonly downstreamTxIds: readonly string[];
    readonly downstreamSpendUsdc: string | null;
  };
  readonly jobId: string | null;
  readonly report: string | null;
  readonly decidedAt: string;
}

export interface SummaryInput {
  readonly release: string;
  readonly target: { readonly url: string; readonly method: HttpMethod };
  readonly network: string;
  readonly gate: Gate;
  readonly exitCode: number;
  readonly reason: string;
  readonly report: ReleaseTestResponse | null;
  readonly decidedAt: Date;
}

export function gateSummary(input: SummaryInput): GateSummary {
  const { report } = input;
  return {
    schema: "selo.gate.v1",
    release: { id: input.release, verification: "asserted_by_client" },
    target: input.target,
    network: input.network,
    gate: input.gate,
    exitCode: input.exitCode,
    reason: input.reason,
    verdict: report?.verdict ?? null,
    inconclusiveReason: report?.inconclusiveReason ?? null,
    checks: (report?.checks ?? []).map(({ id, status, code, summary }) => ({
      id,
      status,
      code,
      summary,
    })),
    warnings: report?.warnings ?? [],
    money: {
      seloInboundTxId: report?.money.seloInboundTxId ?? null,
      downstreamTxIds: report?.money.downstreamTxIds ?? [],
      downstreamSpendUsdc: report?.money.downstreamSpendUsdc ?? null,
    },
    jobId: report?.jobId ?? null,
    report: report === null ? null : redactReportUrl(report.reportUrl),
    decidedAt: input.decidedAt.toISOString(),
  };
}

const cell = (text: string): string => text.replaceAll("|", "\\|").replaceAll("\n", " ");

export function summaryMarkdown(summary: GateSummary): string {
  const head =
    summary.gate === "ALLOW" ? "ALLOW: release may be promoted" : "BLOCK: do not promote";
  const lines = [
    `### Selo release gate: ${head}`,
    "",
    `**${cell(summary.reason)}**`,
    "",
    "| | |",
    "| --- | --- |",
    `| Release | \`${cell(summary.release.id)}\` (asserted by the caller) |`,
    `| Target | \`${summary.target.method} ${cell(summary.target.url)}\` |`,
    `| Network | ${summary.network} |`,
    `| Verdict | ${summary.verdict ?? "none"} |`,
    `| Selo was paid | ${summary.money.seloInboundTxId ?? "no settlement recorded"} |`,
    `| Selo paid the target | ${summary.money.downstreamTxIds.join(", ") || "no payment recorded"} |`,
    `| Job | ${summary.jobId ?? "none"} |`,
  ];
  if (summary.checks.length > 0) {
    lines.push("", "| Check | Status | Code | Summary |", "| --- | --- | --- | --- |");
    for (const check of summary.checks) {
      lines.push(`| ${check.id} | ${check.status} | ${check.code} | ${cell(check.summary)} |`);
    }
  }
  return `${lines.join("\n")}\n`;
}

export async function writeSummaryFile(path: string, summary: GateSummary): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(summary, null, 2)}\n`);
}

export async function appendStepSummary(path: string, summary: GateSummary): Promise<void> {
  await appendFile(path, summaryMarkdown(summary));
}

export async function saveAttestation(
  out: { readonly line: (text: string) => void },
  path: string,
  attestation: ReleaseAttestation | undefined,
): Promise<void> {
  if (attestation === undefined) {
    out.line("attestation none: Selo issued no signed attestation for this run");
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(attestation, null, 2)}\n`);
  out.line(`attestation ${path} (signed by ${attestation.signature.keyId})`);
}
