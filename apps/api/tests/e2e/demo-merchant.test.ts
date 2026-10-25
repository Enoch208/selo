import type { CheckId, CheckResult, ReleaseTestResponse } from "@selo/core";
import contract from "@selo/example-merchant/contract.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import { captureOutput, useOrchestratorHarness } from "../orchestrator/harness";
import { DemoDeployment } from "./demo-deployment";
import { authorizeByWellKnownFile, payForReleaseTest, seloFor, seloInbound } from "./demo-flow";

useOrchestratorHarness();
captureOutput();

function check(report: ReleaseTestResponse, id: CheckId): CheckResult {
  const found = report.checks.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(`report has no ${id} check`);
  }
  return found;
}

async function runRelease(deployment: DemoDeployment, variant: string) {
  const selo = await seloFor(deployment);
  const authorization = await authorizeByWellKnownFile(selo, deployment);
  expect(authorization.status).toBe("VERIFIED");
  const health = await deployment.health();
  const run = await payForReleaseTest(selo, authorization.authorizationId, contract, variant);
  return { health, ...run };
}

describe("owned demo merchant through the real release gate", () => {
  it("broken-v1 is healthy and settles, yet the paid response fails the release contract", async () => {
    seloInbound.reset();
    const deployment = new DemoDeployment("broken-v1");
    const { health, status, report } = await runRelease(deployment, "broken");

    expect(health.status).toBe(200);
    expect(await health.json()).toEqual({ status: "ok", release: "broken-v1" });
    expect(status).toBe(200);
    expect(report.verdict).toBe("FAIL");
    const contractCheck = check(report, "response_contract");
    expect(contractCheck).toMatchObject({
      status: "FAIL",
      code: "SCHEMA_MISMATCH",
      blocking: true,
    });
    expect(contractCheck.summary).toContain("receiptId");
    expect(contractCheck.evidence.length).toBeGreaterThan(0);
    for (const id of [
      "handshake",
      "paid_delivery",
      "discovery_contract",
      "retry_safety",
    ] as const) {
      expect(check(report, id).status, id).toBe("PASS");
    }
    expect(report.money.seloInboundTxId).toMatch(/^INBOUNDTX/);
    expect(report.money.downstreamTxIds).toHaveLength(1);
    expect(report.money.downstreamSpendUsdc).toBe("0.01");
    expect(deployment.facilitator.settled).toHaveLength(1);
  });

  it("fixed-v2 passes all five checks with evidence", async () => {
    seloInbound.reset();
    const deployment = new DemoDeployment("fixed-v2");
    const { health, status, report } = await runRelease(deployment, "fixed");

    expect(health.status).toBe(200);
    expect(status).toBe(200);
    expect(report.verdict).toBe("PASS");
    expect(report.warnings).toEqual([]);
    expect(report.checks).toHaveLength(5);
    for (const entry of report.checks) {
      expect(entry.status, entry.id).toBe("PASS");
      expect(entry.evidence.length, entry.id).toBeGreaterThan(0);
    }
    expect(check(report, "response_contract").code).toBe("CONTRACT_MATCHED");
    expect(check(report, "discovery_contract").code).toBe("DISCOVERY_CONSISTENT");
    expect(check(report, "retry_safety").code).toBe("PASS_REPLAY_REJECTED");
    expect(deployment.facilitator.settled).toHaveLength(1);
  });

  it("FAIL, fix, PASS: the same URL fails on broken-v1 and passes once fixed-v2 ships", async () => {
    seloInbound.reset();
    const deployment = new DemoDeployment("broken-v1");
    const broken = await runRelease(deployment, "first");
    deployment.ship("fixed-v2");
    const fixed = await runRelease(deployment, "second");

    expect([broken.health.status, fixed.health.status]).toEqual([200, 200]);
    expect([broken.report.verdict, fixed.report.verdict]).toEqual(["FAIL", "PASS"]);
    expect(broken.report.target).toBe(fixed.report.target);
    expect(broken.report.jobId).not.toBe(fixed.report.jobId);
    expect(broken.report.money.seloInboundTxId).not.toBe(fixed.report.money.seloInboundTxId);
    const downstream = [
      ...broken.report.money.downstreamTxIds,
      ...fixed.report.money.downstreamTxIds,
    ];
    expect(new Set(downstream).size).toBe(2);
    expect(deployment.facilitator.settled).toHaveLength(2);
    expect(seloInbound.settleCalls()).toHaveLength(2);
  });
});
