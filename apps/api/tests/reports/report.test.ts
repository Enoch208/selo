import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { releaseJobs } from "../../src/db/schema";
import { sha256Hex } from "../../src/ids";
import { buildReport } from "../../src/reports/build";
import { reportToken } from "../../src/reports/token";
import { app, db } from "../support";
import {
  captureOutput,
  publicBaseUrl,
  reportTokenSecret,
  reportsDir,
  runnerWith,
  scheme,
  seedRunnableJob,
  seller,
  useOrchestratorHarness,
} from "../orchestrator/harness";
import { operatorMnemonic } from "../orchestrator/mnemonic-scheme";
import { targetUrl } from "../orchestrator/stock-seller";

useOrchestratorHarness();
const output = captureOutput();

const privateHeaders = {
  "x-robots-tag": "noindex, nofollow",
  "cache-control": "private, no-store",
  "referrer-policy": "no-referrer",
};

function headersOf(response: Response): Record<string, string | null> {
  return Object.fromEntries(
    Object.keys(privateHeaders).map((name) => [name, response.headers.get(name)]),
  );
}

describe("buildReport", () => {
  it("carries the report contents for a finished job", async () => {
    const jobId = await seedRunnableJob({
      expected: { status: 200, contentType: "application/json" },
    });
    await runnerWith().run(jobId);
    const report = await buildReport(db, jobId);
    expect(report).toMatchObject({
      jobId,
      project: "quote-api",
      target: { url: targetUrl, method: "GET" },
      seloVersion: "testsha",
      verdict: "PASS",
      inconclusiveReason: null,
      expected: { status: 200, contentType: "application/json" },
      observedResponse: { status: 200, contentType: "application/json" },
      money: {
        inboundTxId: `INBOUND${jobId}`,
        downstreamTxIds: [scheme.signedTxIds[0]],
        downstreamSpendUsdc: "0.01",
        unresolvedSpendUsdc: "0.00",
      },
      failureCodes: [],
    });
    expect(report.targetChallengeSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(report.testedAt).toEqual(expect.any(String));
    expect(report.scenarios.map((scenario) => scenario.check)).toEqual([
      "handshake",
      "paid_delivery",
      "response_contract",
      "discovery_contract",
      "retry_safety",
    ]);
    for (const scenario of report.scenarios) {
      expect(scenario.durationMs).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("evidence packet", () => {
  it("writes a private, sanitized evidence.json for the job", async () => {
    const jobId = await seedRunnableJob();
    await runnerWith().run(jobId);
    const directory = join(reportsDir, jobId);
    expect(statSync(directory).mode & 0o777).toBe(0o700);
    const text = readFileSync(join(directory, "evidence.json"), "utf8");
    const packet = JSON.parse(text) as Record<string, unknown>;
    expect(Object.keys(packet).sort()).toEqual(
      [
        "authorization",
        "downstreamPayments",
        "generatedAt",
        "inboundPayment",
        "jobId",
        "scenarios",
        "target",
        "verdict",
        "verdictDetail",
        "version",
      ].sort(),
    );
    expect(packet).toMatchObject({
      jobId,
      version: 1,
      verdict: "PASS",
      verdictDetail: { verdict: "PASS", inconclusiveReason: null },
    });
    const signature = seller.paidRequests()[0]?.signature ?? "missing";
    expect(text).not.toContain(signature);
    expect(text).not.toContain(operatorMnemonic.split(" ").slice(0, 3).join(" "));
  });
});

describe("evidence packet write failure", () => {
  it("still completes the paid job from the database and alerts", async () => {
    const blocked = join(reportsDir, "blocked-file");
    writeFileSync(blocked, "not a directory");
    const jobId = await seedRunnableJob();
    const answer = await runnerWith({
      reports: { dir: blocked, tokenSecret: reportTokenSecret, publicBaseUrl },
    }).run(jobId);

    expect(answer.verdict).toBe("PASS");
    const [row] = await db.select().from(releaseJobs).where(eq(releaseJobs.id, jobId));
    expect(row?.status).toBe("REPORT_WRITTEN");
    expect(output.stderr.join("")).toContain(
      `ALERT event=evidence_packet_write_failed jobId=${jobId}`,
    );
    const token = reportToken(reportTokenSecret, jobId);
    expect((await app.request(`/v1/reports/${token}`)).status).toBe(200);
  });
});

describe("GET /v1/reports/:token", () => {
  it("returns the report for its token with private, noindex headers and stores only the hash", async () => {
    const jobId = await seedRunnableJob();
    const answer = await runnerWith().run(jobId);
    const token = reportToken(reportTokenSecret, jobId);
    expect(answer.reportUrl).toBe(`https://selo.example/api/v1/reports/${token}`);
    const [row] = await db.select().from(releaseJobs).where(eq(releaseJobs.id, jobId));
    expect(row?.reportTokenHash).toBe(sha256Hex(token));
    expect(JSON.stringify(row)).not.toContain(token);

    const response = await app.request(`/v1/reports/${token}`);
    expect(response.status).toBe(200);
    expect(headersOf(response)).toEqual(privateHeaders);
    expect(await response.json()).toEqual(JSON.parse(JSON.stringify(await buildReport(db, jobId))));
  });

  it("answers an unknown or malformed token with the same generic 404", async () => {
    const jobId = await seedRunnableJob();
    await runnerWith().run(jobId);
    const unknown = reportToken("another-secret-that-is-long-enough!!", jobId);
    const bodies: unknown[] = [];
    for (const token of [unknown, "not-a-token", jobId]) {
      const response = await app.request(`/v1/reports/${token}`);
      expect(response.status).toBe(404);
      expect(headersOf(response)).toEqual(privateHeaders);
      bodies.push(await response.json());
    }
    expect(new Set(bodies.map((body) => JSON.stringify(body))).size).toBe(1);
  });
});
