import type { AttestationKey, AttestationKeySet } from "@selo/core";
import { Hono } from "hono";

export const attestationKeysPath = "/.well-known/selo-attestation-keys.json";

export function attestationKeyRoutes(keys: readonly AttestationKey[]) {
  return new Hono().get(attestationKeysPath, (c) => {
    c.header("Cache-Control", "public, max-age=300");
    return c.json({ keys } satisfies AttestationKeySet);
  });
}
