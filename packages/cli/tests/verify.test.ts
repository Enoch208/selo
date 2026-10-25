import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJson, type Verdict } from "@selo/core";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/cli";
import type { TestContext } from "../src/commands/test";

const target = "https://shop.example.com/v1/orders";

function keyPair() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const x = publicKey.export({ format: "jwk" }).x ?? "";
  const keyId = `selo-ed25519-${createHash("sha256").update(Buffer.from(x, "base64url")).digest("hex").slice(0, 16)}`;
  return { privateKey, key: { keyId, algorithm: "Ed25519", publicKey: x } };
}

const trusted = keyPair();

function payload(verdict: Verdict, release: string | null = "fixed-v2") {
  return {
    schemaVersion: "selo.release.v1",
    issuer: "https://api.useselo.xyz",
    jobId: "job_VERIFY1",
    testedTarget: { url: target, method: "POST" },
    deployment: release === null ? null : { id: release, verification: "asserted_by_client" },
    testedAt: "2026-10-25T12:00:00.000Z",
    completedAt: "2026-10-25T12:00:05.000Z",
    seloVersion: "abc1234",
    verdict,
    inconclusiveReason: verdict === "INCONCLUSIVE" ? "EVIDENCE_INCOMPLETE" : null,
    checks: [],
    expectedContractSha256: null,
    targetChallengeSha256: null,
    payments: {
      network: "algorand:wGHE2Pwdvd7S12BL5FaOP20EGYesN73ktiC1qzkkit8=",
      asset: "31566704",
      inboundTxId: "INBOUNDTX",
      inboundAmountUsdc: "1.00",
      downstream: [{ status: "SETTLED", amountUsdc: "0.01", txId: "DOWNSTREAMTX" }],
    },
    evidenceSha256: "e".repeat(64),
    evidence: [],
  };
}

function signed(body: unknown, signer = trusted) {
  return {
    payload: body,
    signature: {
      algorithm: "Ed25519",
      keyId: signer.key.keyId,
      value: sign(null, Buffer.from(canonicalJson(body)), signer.privateKey).toString("base64url"),
    },
  };
}

function harness() {
  const dir = mkdtempSync(join(tmpdir(), "selo-verify-"));
  const keysFile = join(dir, "keys.json");
  writeFileSync(keysFile, JSON.stringify({ keys: [trusted.key] }));
  const lines: string[] = [];
  const fetched: string[] = [];
  const ctx: TestContext = {
    fetch: (input) => {
      fetched.push(input);
      return Promise.resolve(
        new Response(JSON.stringify({ keys: [trusted.key] }), { status: 200 }),
      );
    },
    out: { line: (text) => lines.push(text), error: (text) => lines.push(text) },
    payerMnemonic: undefined,
    wallet: () => {
      throw new Error("verify needs no wallet");
    },
    now: () => new Date(),
    stateDir: join(dir, "runs"),
    stepSummaryFile: null,
  };
  const verify = (attestation: unknown, extra: readonly string[] = []) => {
    const file = join(dir, `attestation-${String(lines.length)}.json`);
    writeFileSync(file, JSON.stringify(attestation));
    return runCli(
      [
        "verify",
        "--attestation",
        file,
        "--keys",
        keysFile,
        "--release",
        "fixed-v2",
        "--url",
        target,
        "--method",
        "POST",
        ...extra,
      ],
      ctx,
    );
  };
  return { dir, lines, fetched, verify };
}

describe("selo verify", () => {
  it("exits with the attested verdict when the signature and binding hold", async () => {
    const h = harness();
    expect(await h.verify(signed(payload("PASS")))).toBe(0);
    expect(await h.verify(signed(payload("FAIL")))).toBe(1);
    expect(await h.verify(signed(payload("INCONCLUSIVE")))).toBe(2);
    expect(h.lines.join("\n")).toMatch(/verified\s+signature by selo-ed25519-/);
  });

  it("refuses an attestation whose signed fields were changed", async () => {
    const h = harness();
    const original = signed(payload("FAIL"));
    const forged = { ...original, payload: { ...payload("FAIL"), verdict: "PASS" } };
    expect(await h.verify(forged)).toBe(2);
    expect(h.lines.join("\n")).toMatch(/signature does not verify/);
  });

  it("refuses a signature by a key it does not trust", async () => {
    const h = harness();
    expect(await h.verify(signed(payload("PASS"), keyPair()))).toBe(2);
    expect(h.lines.join("\n")).toMatch(/not among the trusted keys/);
  });

  it("refuses a PASS for another release, another target or no release at all", async () => {
    const h = harness();
    expect(await h.verify(signed(payload("PASS", "broken-v1")))).toBe(2);
    expect(await h.verify(signed(payload("PASS", null)))).toBe(2);
    expect(await h.verify(signed(payload("PASS")), ["--url", "https://other.example/x"])).toBe(2);
    expect(await h.verify(signed(payload("PASS")), ["--method", "GET"])).toBe(2);
  });

  it("refuses files that are not attestations", async () => {
    const h = harness();
    expect(await h.verify({ verdict: "PASS" })).toBe(2);
    expect(await h.verify("not json at all")).toBe(2);
  });

  it("reads trusted keys over https only", async () => {
    const h = harness();
    const keys = "https://api.useselo.xyz/.well-known/selo-attestation-keys.json";
    expect(await h.verify(signed(payload("PASS")), ["--keys", keys])).toBe(0);
    expect(h.fetched).toEqual([keys]);
    expect(await h.verify(signed(payload("PASS")), ["--keys", "http://keys.example/k.json"])).toBe(
      3,
    );
  });
});
