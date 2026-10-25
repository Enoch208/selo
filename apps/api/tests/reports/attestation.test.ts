import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { canonicalJson, type ReleaseAttestationPayload } from "@selo/core";
import { describe, expect, it } from "vitest";
import { loadOperatorEnv } from "../../src/env";
import { createAttestationSigner } from "../../src/reports/attestation";
import { operatorMnemonic } from "../orchestrator/mnemonic-scheme";

const payload: ReleaseAttestationPayload = {
  schemaVersion: "selo.release.v1",
  issuer: "https://selo.example",
  jobId: "job_ATTEST1",
  testedTarget: { url: "https://shop.example.com/v1/orders", method: "POST" },
  deployment: { id: "fixed-v2", verification: "asserted_by_client" },
  testedAt: "2026-10-25T12:00:00.000Z",
  completedAt: "2026-10-25T12:00:05.000Z",
  seloVersion: "abc1234",
  verdict: "PASS",
  inconclusiveReason: null,
  checks: [{ id: "handshake", status: "PASS", code: "OK", blocking: true, evidence: ["evd_1"] }],
  expectedContractSha256: "a".repeat(64),
  targetChallengeSha256: "b".repeat(64),
  payments: {
    network: "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=",
    asset: "31566704",
    inboundTxId: "INBOUND",
    inboundAmountUsdc: "1.00",
    downstream: [{ status: "SETTLED", amountUsdc: "0.01", txId: "DOWNSTREAM" }],
  },
  evidenceSha256: "c".repeat(64),
  evidence: [{ id: "evd_1", kind: "paid_response", sha256: "d".repeat(64) }],
};

function freshKey() {
  return generateKeyPairSync("ed25519").privateKey;
}

function verifies(publicKey: string, signed: unknown, value: string): boolean {
  const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: publicKey }, format: "jwk" });
  return verify(null, Buffer.from(canonicalJson(signed)), key, Buffer.from(value, "base64url"));
}

describe("release attestation signing", () => {
  it("signs the canonical payload so the published key verifies it", () => {
    const signer = createAttestationSigner(freshKey());
    const attestation = signer.sign(payload);
    expect(signer.key.keyId).toMatch(/^selo-ed25519-[0-9a-f]{16}$/);
    expect(attestation.signature).toMatchObject({ algorithm: "Ed25519", keyId: signer.key.keyId });
    expect(attestation.payload).toBe(payload);
    expect(verifies(signer.key.publicKey, payload, attestation.signature.value)).toBe(true);
  });

  it("is deterministic, so a duplicate reply carries byte-identical proof", () => {
    const signer = createAttestationSigner(freshKey());
    const reordered = { ...payload, verdict: payload.verdict, jobId: payload.jobId };
    expect(signer.sign(reordered).signature.value).toBe(signer.sign(payload).signature.value);
  });

  it("no longer verifies after any signed field changes", () => {
    const signer = createAttestationSigner(freshKey());
    const { value } = signer.sign(payload).signature;
    const tampered: readonly unknown[] = [
      { ...payload, verdict: "FAIL" },
      { ...payload, deployment: { id: "broken-v1", verification: "asserted_by_client" } },
      { ...payload, testedTarget: { ...payload.testedTarget, url: "https://other.example/x" } },
      { ...payload, payments: { ...payload.payments, inboundTxId: "OTHER" } },
      { ...payload, evidenceSha256: "e".repeat(64) },
    ];
    for (const changed of tampered) {
      expect(verifies(signer.key.publicKey, changed, value)).toBe(false);
    }
  });

  it("refuses a key that is not Ed25519", () => {
    const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
    expect(() => createAttestationSigner(rsa)).toThrow(/Ed25519/);
  });
});

describe("SELO_ATTESTATION_KEY", () => {
  const base = { SELO_OPERATOR_MNEMONIC: operatorMnemonic, REPORT_TOKEN_SECRET: "r".repeat(32) };
  const der = freshKey().export({ format: "der", type: "pkcs8" }).toString("base64");

  it("is optional and disables attestations when blank", () => {
    expect(loadOperatorEnv(base).SELO_ATTESTATION_KEY).toBeNull();
    expect(loadOperatorEnv({ ...base, SELO_ATTESTATION_KEY: "" }).SELO_ATTESTATION_KEY).toBeNull();
  });

  it("loads a base64 PKCS#8 Ed25519 key", () => {
    const key = loadOperatorEnv({ ...base, SELO_ATTESTATION_KEY: der }).SELO_ATTESTATION_KEY;
    expect(key?.asymmetricKeyType).toBe("ed25519");
  });

  it("rejects anything else without echoing the value", () => {
    const secretish = "bm90LWEta2V5LWF0LWFsbC1qdXN0LXNvbWUtdGV4dA==";
    let message = "";
    try {
      loadOperatorEnv({ ...base, SELO_ATTESTATION_KEY: secretish });
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/Ed25519 private key/);
    expect(message).not.toContain(secretish);
  });
});
