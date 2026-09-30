import { hashTag } from "../evidence/secret-values";

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function g2EvidenceResponse(response: unknown): unknown {
  if (!isRecord(response) || typeof response.reportUrl !== "string") {
    return response;
  }
  const { reportUrl, ...rest } = response;
  const token = new URL(reportUrl, "https://report.invalid").pathname.split("/").pop() ?? "";
  return { ...rest, reportTokenSha256: hashTag(token) };
}
