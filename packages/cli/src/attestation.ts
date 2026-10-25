import { createPublicKey, verify } from "node:crypto";
import {
  attestationSchemaVersion,
  canonicalJson,
  httpMethods,
  verdicts,
  type AttestationKey,
  type HttpMethod,
  type Verdict,
} from "@selo/core";
import { z } from "zod";

const keySetSchema = z.looseObject({
  keys: z.array(
    z.looseObject({
      keyId: z.string(),
      algorithm: z.literal("Ed25519"),
      publicKey: z.string(),
    }),
  ),
});

const envelopeSchema = z.looseObject({
  payload: z.looseObject({
    schemaVersion: z.string(),
    jobId: z.string(),
    issuer: z.string(),
    testedTarget: z.looseObject({ url: z.string(), method: z.enum(httpMethods) }),
    deployment: z.looseObject({ id: z.string(), verification: z.string() }).nullable(),
    verdict: z.enum(verdicts),
    payments: z.looseObject({
      inboundTxId: z.string().nullable(),
      downstream: z.array(z.looseObject({ txId: z.string().nullable() })),
    }),
  }),
  signature: z.looseObject({
    algorithm: z.literal("Ed25519"),
    keyId: z.string(),
    value: z.string(),
  }),
});

export interface Expectation {
  readonly release: string;
  readonly url: string;
  readonly method: HttpMethod;
}

export interface Attested {
  readonly jobId: string;
  readonly issuer: string;
  readonly keyId: string;
  readonly verdict: Verdict;
  readonly release: string;
  readonly inboundTxId: string | null;
  readonly downstreamTxIds: readonly string[];
}

export type Verification =
  | { readonly ok: true; readonly attested: Attested }
  | { readonly ok: false; readonly reason: string };

export function parseKeySet(body: unknown): readonly AttestationKey[] | null {
  const parsed = keySetSchema.safeParse(body);
  return parsed.success ? parsed.data.keys : null;
}

function signatureHolds(key: AttestationKey, payload: unknown, value: string): boolean {
  try {
    const publicKey = createPublicKey({
      key: { kty: "OKP", crv: "Ed25519", x: key.publicKey },
      format: "jwk",
    });
    return verify(
      null,
      Buffer.from(canonicalJson(payload)),
      publicKey,
      Buffer.from(value, "base64url"),
    );
  } catch {
    return false;
  }
}

const refuse = (reason: string): Verification => ({ ok: false, reason });

export function verifyAttestation(
  raw: unknown,
  keys: readonly AttestationKey[],
  expected: Expectation,
): Verification {
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success || typeof raw !== "object" || raw === null || !("payload" in raw)) {
    return refuse("the file is not a Selo release attestation");
  }
  const { payload, signature } = envelope.data;
  const key = keys.find((candidate) => candidate.keyId === signature.keyId);
  if (key === undefined) {
    return refuse(`it is signed by ${signature.keyId}, which is not among the trusted keys`);
  }
  if (!signatureHolds(key, raw.payload, signature.value)) {
    return refuse("the signature does not verify; the attestation was altered or forged");
  }
  if (payload.schemaVersion !== attestationSchemaVersion) {
    return refuse(`unsupported schema ${payload.schemaVersion}`);
  }
  if (payload.deployment?.id !== expected.release) {
    return refuse(
      `it attests release ${payload.deployment?.id ?? "(none)"}, not ${expected.release}`,
    );
  }
  const { url, method } = payload.testedTarget;
  if (url !== expected.url || method !== expected.method) {
    return refuse(`it attests ${method} ${url}, not ${expected.method} ${expected.url}`);
  }
  return {
    ok: true,
    attested: {
      jobId: payload.jobId,
      issuer: payload.issuer,
      keyId: signature.keyId,
      verdict: payload.verdict,
      release: expected.release,
      inboundTxId: payload.payments.inboundTxId,
      downstreamTxIds: payload.payments.downstream.flatMap((payment) =>
        payment.txId === null ? [] : [payment.txId],
      ),
    },
  };
}
