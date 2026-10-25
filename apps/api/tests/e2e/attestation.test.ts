import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import {
  canonicalJson,
  type AttestationKeySet,
  type ReleaseAttestation,
  type ReleaseTestResponse,
} from "@selo/core";
import contract from "@selo/example-merchant/contract.json" with { type: "json" };
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../src/ids";
import { createAttestationSigner } from "../../src/reports/attestation";
import { captureOutput, useOrchestratorHarness } from "../orchestrator/harness";
import { DemoDeployment, demoUrl } from "./demo-deployment";
import { authorizeByWellKnownFile, payForReleaseTest, seloFor, seloInbound } from "./demo-flow";

useOrchestratorHarness();
captureOutput();

const signer = createAttestationSigner(generateKeyPairSync("ed25519").privateKey);

function attestationOf(report: ReleaseTestResponse): ReleaseAttestation {
  if (report.attestation === undefined) {
    throw new Error("the release test response carries no attestation");
  }
  return report.attestation;
}

function signatureHolds(keys: AttestationKeySet, attestation: ReleaseAttestation): boolean {
  const published = keys.keys.find((key) => key.keyId === attestation.signature.keyId);
  if (published === undefined) {
    return false;
  }
  const jwk = { kty: "OKP", crv: "Ed25519", x: published.publicKey };
  return verify(
    null,
    Buffer.from(canonicalJson(attestation.payload)),
    createPublicKey({ key: jwk, format: "jwk" }),
    Buffer.from(attestation.signature.value, "base64url"),
  );
}

async function signedRun(deploymentId: string | null) {
  seloInbound.reset();
  const deployment = new DemoDeployment("fixed-v2");
  const selo = await seloFor(deployment, signer);
  const authorization = await authorizeByWellKnownFile(selo, deployment);
  const run = await payForReleaseTest(
    selo,
    authorization.authorizationId,
    contract,
    "attested",
    deploymentId,
  );
  const keys = (await (
    await selo.request("/.well-known/selo-attestation-keys.json")
  ).json()) as AttestationKeySet;
  return { selo, run, keys };
}

describe("signed release attestation", () => {
  it("binds the verdict, both payment legs, the contract and the evidence under Selo's key", async () => {
    const { run, keys } = await signedRun("fixed-v2");
    const { report } = run;
    const attestation = attestationOf(report);
    const { payload } = attestation;

    expect(keys.keys).toEqual([signer.key]);
    expect(signatureHolds(keys, attestation)).toBe(true);
    expect(payload).toMatchObject({
      schemaVersion: "selo.release.v1",
      issuer: "https://selo.example",
      jobId: report.jobId,
      testedTarget: { url: demoUrl, method: "POST" },
      deployment: { id: "fixed-v2", verification: "asserted_by_client" },
      verdict: "PASS",
      inconclusiveReason: null,
      expectedContractSha256: sha256Hex(canonicalJson(contract)),
    });
    expect(payload.payments.inboundTxId).toBe(report.money.seloInboundTxId);
    expect(payload.payments.downstream.map((payment) => payment.txId)).toEqual(
      report.money.downstreamTxIds,
    );
    expect(payload.checks.map(({ id, status }) => ({ id, status }))).toEqual(
      report.checks.map(({ id, status }) => ({ id, status })),
    );
    const manifest = new Set(payload.evidence.map((item) => item.id));
    for (const check of payload.checks) {
      for (const id of check.evidence) {
        expect(manifest.has(id), id).toBe(true);
      }
    }
    expect(payload.evidenceSha256).toBe(sha256Hex(canonicalJson(payload.evidence)));
    const token = report.reportUrl.split("/").at(-1) ?? "missing";
    expect(JSON.stringify(attestation)).not.toContain(token);
  });

  it("returns the identical attestation to a duplicate paid request", async () => {
    const { run } = await signedRun("fixed-v2");
    const again = await run.repeat();
    expect(again.jobId).toBe(run.report.jobId);
    expect(seloInbound.settleCalls()).toHaveLength(1);
    expect(JSON.stringify(attestationOf(again))).toBe(JSON.stringify(attestationOf(run.report)));
  });

  it("records no deployment when the caller asserts none", async () => {
    const { run, keys } = await signedRun(null);
    const attestation = attestationOf(run.report);
    expect(attestation.payload.deployment).toBeNull();
    expect(signatureHolds(keys, attestation)).toBe(true);
  });

  it("issues no attestation and publishes no key when Selo has no signing key", async () => {
    seloInbound.reset();
    const deployment = new DemoDeployment("fixed-v2");
    const selo = await seloFor(deployment);
    const authorization = await authorizeByWellKnownFile(selo, deployment);
    const { report } = await payForReleaseTest(selo, authorization.authorizationId, contract, "x");
    expect(report.attestation).toBeUndefined();
    const keys = (await (
      await selo.request("/.well-known/selo-attestation-keys.json")
    ).json()) as AttestationKeySet;
    expect(keys.keys).toEqual([]);
  });
});
