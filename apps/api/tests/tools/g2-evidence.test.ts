import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { g2EvidenceResponse } from "../../src/tools/g2-evidence";

const token = "Zk3N9q-abcdefghijklmnopqrstuvwxyzABCDEFGHIJ";
const report = {
  jobId: "job_1",
  verdict: "PASS",
  checks: [{ id: "handshake", status: "PASS" }],
  money: { seloInboundTxId: "INBOUNDTX", downstreamTxIds: ["TARGETTX"] },
  reportUrl: `https://selo.example/v1/reports/${token}`,
};

describe("g2EvidenceResponse", () => {
  it("replaces the private report URL with the SHA-256 of its token", () => {
    const redacted = g2EvidenceResponse(report);
    expect(JSON.stringify(redacted)).not.toContain(token);
    expect(redacted).toEqual({
      jobId: "job_1",
      verdict: "PASS",
      checks: report.checks,
      money: report.money,
      reportTokenSha256: `sha256:${createHash("sha256").update(token).digest("hex")}`,
    });
  });

  it("leaves a response without a report URL untouched", () => {
    const error = { error: "INBOUND_SETTLEMENT_UNRESOLVED", jobId: "job_1", txId: null };
    expect(g2EvidenceResponse(error)).toEqual(error);
    expect(g2EvidenceResponse("plain text")).toBe("plain text");
  });
});
