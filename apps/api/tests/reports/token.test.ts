import { describe, expect, it } from "vitest";
import { isReportToken, reportToken, reportUrlFor } from "../../src/reports/token";

const secret = "s".repeat(32);

describe("reportToken", () => {
  it("is a 43-character base64url HMAC that is stable for one job and secret", () => {
    const token = reportToken(secret, "job_A");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(reportToken(secret, "job_A")).toBe(token);
    expect(isReportToken(token)).toBe(true);
  });

  it("changes with the job and with the secret", () => {
    const token = reportToken(secret, "job_A");
    expect(reportToken(secret, "job_B")).not.toBe(token);
    expect(reportToken("t".repeat(32), "job_A")).not.toBe(token);
    expect(token).not.toContain("job_A");
  });

  it("rejects anything that is not a 43-character base64url string", () => {
    for (const candidate of [
      "",
      "short",
      `${"a".repeat(42)}=`,
      `${"a".repeat(43)}a`,
      "a".repeat(42) + "/",
    ]) {
      expect(isReportToken(candidate)).toBe(false);
    }
  });

  it("builds an absolute report URL under the public API base, keeping the base path", () => {
    const token = reportToken(secret, "job_A");
    expect(reportUrlFor("https://selo.example", token)).toBe(
      `https://selo.example/v1/reports/${token}`,
    );
    expect(reportUrlFor("https://selo.example/api//", token)).toBe(
      `https://selo.example/api/v1/reports/${token}`,
    );
    expect(reportUrlFor("https://selo.example/api?x=1#top", token)).toBe(
      `https://selo.example/api/v1/reports/${token}`,
    );
  });

  it("never produces the unrouted /r/ shape", () => {
    expect(reportUrlFor("https://selo.example", reportToken(secret, "job_A"))).not.toContain("/r/");
  });
});
