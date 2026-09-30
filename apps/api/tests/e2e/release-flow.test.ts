import { readFileSync } from "node:fs";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { downstreamPayments, evidence, releaseJobs } from "../../src/db/schema";
import { sha256Hex } from "../../src/ids";
import { db } from "../support";
import { captureOutput, reportsDir, scheme, seller } from "../orchestrator/harness";
import { operatorMnemonic } from "../orchestrator/mnemonic-scheme";
import { targetOrigin, targetUrl } from "../orchestrator/stock-seller";
import {
  e2eApp,
  payRelease,
  prepareRelease,
  seloFacilitator,
  trace,
  useE2eHarness,
} from "./harness";

useE2eHarness();
const output = captureOutput();

const reportUrlPrefix = "https://selo.example/api/v1/reports/";

function tokenOf(reportUrl: string): string {
  expect(reportUrl.startsWith(reportUrlPrefix)).toBe(true);
  return reportUrl.slice(reportUrlPrefix.length);
}

async function paidFlow() {
  const app = await e2eApp();
  const prepared = await prepareRelease(app);
  const paid = await payRelease(app, prepared);
  expect(paid.status).toBe(200);
  const jobId = paid.report.jobId;
  const [job] = await db.select().from(releaseJobs).where(eq(releaseJobs.id, jobId));
  const payments = await db
    .select()
    .from(downstreamPayments)
    .where(eq(downstreamPayments.jobId, jobId));
  return { app, prepared, report: paid.report, jobId, job, payments };
}

describe("paid release test end to end", () => {
  it("A12: inbound settles before the first downstream request", async () => {
    const { job, payments } = await paidFlow();
    const [payment] = payments;
    expect(job?.incomingSettledAt).toBeInstanceOf(Date);
    expect(payment?.requestedAt).toBeInstanceOf(Date);
    expect(job?.incomingSettledAt?.getTime()).toBeLessThan(payment?.requestedAt?.getTime() ?? 0);
    expect(seloFacilitator.settleCalls()).toHaveLength(1);
    expect(trace).toEqual(["selo:settled", "target:paid", "target:paid"]);
  });

  it("A13: Selo pays one authorized target", async () => {
    const { report, payments } = await paidFlow();
    expect(report.verdict).toBe("PASS");
    expect(payments).toHaveLength(1);
    expect(payments[0]).toMatchObject({ status: "SETTLED", targetOrigin, amountMicros: 10_000 });
    expect(seller.facilitator.settled).toHaveLength(1);
    expect(new Set(seller.requests.map((request) => request.allowedOrigin))).toEqual(
      new Set([targetOrigin]),
    );
    expect(scheme.signedTxIds).toHaveLength(1);
  });

  it("A14: the downstream paid response is captured", async () => {
    const { jobId } = await paidFlow();
    const rows = await db.select().from(evidence).where(eq(evidence.jobId, jobId));
    const paid = rows.find((row) => row.kind === "paid_response");
    const body = JSON.stringify(seller.handlerBody);
    expect(paid?.sanitizedJson).toMatchObject({
      status: 200,
      contentType: "application/json",
      bodySha256: sha256Hex(body),
      bodyBytes: Buffer.byteLength(body),
      bodyPreview: body,
      txId: scheme.signedTxIds[0],
    });
    const signature = seller.paidRequests()[0]?.signature ?? "missing";
    expect(paid?.sanitizedJson).toMatchObject({
      replayHeaderSha256: `sha256:${sha256Hex(signature)}`,
    });
  });

  it("A15: the downstream tx id is persisted", async () => {
    const { report, payments } = await paidFlow();
    const [signedTxId] = scheme.signedTxIds;
    expect(signedTxId).toMatch(/^[A-Z2-7]{52}$/);
    expect(payments[0]).toMatchObject({ txId: signedTxId, expectedTxId: signedTxId });
    expect(report.money.downstreamTxIds).toEqual([signedTxId]);
    expect(report.money.downstreamSpendUsdc).toBe("0.01");
    expect(report.money.seloInboundTxId).toBe("INBOUNDTX1");
  });

  it("A20: every blocking PASS in the report has evidence rows that exist", async () => {
    const { report, jobId } = await paidFlow();
    const rows = await db.select().from(evidence).where(eq(evidence.jobId, jobId));
    const ids = new Set(rows.map((row) => row.id));
    const passes = report.checks.filter((check) => check.blocking && check.status === "PASS");
    expect(passes).toHaveLength(5);
    for (const check of passes) {
      expect(check.evidence.length).toBeGreaterThan(0);
      for (const id of check.evidence) {
        expect(ids.has(id)).toBe(true);
      }
    }
    expect(report.checks.find((check) => check.id === "retry_safety")?.code).toBe(
      "PASS_REPLAY_REJECTED",
    );
  });

  it("A21: the duplicate paid request returns the same report and pays the target once", async () => {
    const { app, prepared, report } = await paidFlow();
    const again = await payRelease(app, prepared);
    expect(again.status).toBe(200);
    expect(again.report).toEqual(report);
    expect(await db.select().from(releaseJobs)).toHaveLength(1);
    expect(seller.facilitator.settled).toHaveLength(1);
    expect(scheme.signedTxIds).toHaveLength(1);
    expect(seloFacilitator.settleCalls()).toHaveLength(1);
  });

  it("A22: logs, evidence, reports and the evidence packet contain no wallet secret", async () => {
    const { app, report, jobId } = await paidFlow();
    const token = tokenOf(report.reportUrl);
    const fetched = await (await app.request(`/v1/reports/${token}`)).text();
    const rows = await db.select().from(evidence).where(eq(evidence.jobId, jobId));
    const packet = readFileSync(join(reportsDir, jobId, "evidence.json"), "utf8");
    const signatures = seller.paidRequests().map((request) => request.signature ?? "");
    const haystacks = {
      stdout: output.stdout.join(""),
      stderr: output.stderr.join(""),
      evidence: JSON.stringify(rows),
      response: JSON.stringify(report),
      report: fetched,
      packet,
    };
    const words = operatorMnemonic.split(" ");
    for (const [where, text] of Object.entries(haystacks)) {
      expect(where === "stderr" || text.length > 0, where).toBe(true);
      for (let start = 0; start + 3 <= words.length; start += 1) {
        expect(text, where).not.toContain(words.slice(start, start + 3).join(" "));
      }
      for (const signature of signatures) {
        expect(signature.length).toBeGreaterThan(100);
        expect(text, where).not.toContain(signature);
      }
    }
  });

  it("A23: the report token is unguessable and the report is noindex", async () => {
    const { app, report, job } = await paidFlow();
    const token = tokenOf(report.reportUrl);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43,}$/);
    expect(job?.reportTokenHash).toBe(sha256Hex(token));
    expect(JSON.stringify(job)).not.toContain(token);
    const found = await app.request(`/v1/reports/${token}`);
    expect(found.status).toBe(200);
    expect(found.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(found.headers.get("cache-control")).toBe("private, no-store");
    expect(found.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await found.json()).toMatchObject({ jobId: report.jobId, target: { url: targetUrl } });
    const flipped = `${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`;
    const wrong = await app.request(`/v1/reports/${flipped}`);
    expect(wrong.status).toBe(404);
    expect(wrong.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});
