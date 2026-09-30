import { describe, expect, it } from "vitest";
import { sanitize } from "../../src/evidence/sanitize";
import { hashTag } from "../../src/evidence/secret-values";

const exactSecretKeys = [
  "authorization",
  "Authorization",
  "Proxy-Authorization",
  "cookie",
  "Set-Cookie",
  "X-PAYMENT",
  "x_payment",
  "PAYMENT-SIGNATURE",
  "sk",
  "sig",
  "access_token",
  "refreshToken",
  "id_token",
  "api-key",
  "apiKey",
  "Bearer",
];

const substringSecretKeys = [
  "mnemonic",
  "walletMnemonic",
  "clientSecret",
  "SECRET_VALUE",
  "privateKey",
  "private_key",
  "password",
  "dbPassword",
  "passphrase",
  "keyPassphrase",
  "signature",
  "paymentSignature",
];

function nestedUnder(key: string, value: unknown): unknown {
  return { level1: [{ level2: { level3: { [key]: value } } }] };
}

describe("sanitize secret key tiers", () => {
  it.each([...exactSecretKeys, ...substringSecretKeys])(
    "hashes a string and redacts an object under %s at any depth",
    (key) => {
      expect(sanitize({ [key]: "top-secret" })).toEqual({ [key]: hashTag("top-secret") });
      expect(sanitize(nestedUnder(key, "deep-secret"))).toEqual(
        nestedUnder(key, hashTag("deep-secret")),
      );
      expect(sanitize(nestedUnder(key, 42))).toEqual(nestedUnder(key, "[redacted]"));
      if (key.toLowerCase() !== "authorization") {
        expect(sanitize(nestedUnder(key, { inner: 1 }))).toEqual(nestedUnder(key, "[redacted]"));
      }
    },
  );

  it("keeps real evidence whose key only resembles a secret", () => {
    const evidence = {
      authorizationId: "auth_01J",
      authorization_type: "manual_owner_consent",
      tokenHash: "f".repeat(64),
      usage: { prompt_tokens: 12, completion_tokens: 30, max_tokens: 200, total_tokens: 42 },
      isPrivate: false,
      privateNetwork: false,
      target: {
        authorization: { origin: "https://api.example.com", status: "VERIFIED" },
      },
      headers: { "x-payment-response": "eyJzdWNjZXNzIjp0cnVlfQ==", "content-type": "text/plain" },
      signer: "ADDRESS",
      skip: 3,
    };
    const kept = sanitize(evidence);
    expect(kept).toMatchObject({
      authorizationId: "auth_01J",
      authorization_type: "manual_owner_consent",
      tokenHash: "f".repeat(64),
      usage: evidence.usage,
      isPrivate: false,
      privateNetwork: false,
      headers: evidence.headers,
      signer: "ADDRESS",
      skip: 3,
    });
    expect(kept).toEqual(evidence);
  });

  it("sanitizes inside an authorization snapshot object instead of dropping it", () => {
    const snapshot = {
      authorization: { origin: "https://api.example.com", status: "VERIFIED", secret: "nonce" },
    };
    expect(sanitize(snapshot)).toEqual({
      authorization: {
        origin: "https://api.example.com",
        status: "VERIFIED",
        secret: hashTag("nonce"),
      },
    });
  });

  it("redacts non-object, non-string values under authorization", () => {
    expect(sanitize({ authorization: ["Bearer a"] })).toEqual({ authorization: "[redacted]" });
  });
});
