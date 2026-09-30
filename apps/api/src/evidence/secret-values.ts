import { sha256Hex } from "../ids";
import { scrubMnemonics } from "./mnemonic-runs";

const base64Token = /[A-Za-z0-9+/_-]{40,}={0,2}/g;
const signedTransactionKeys = new Set(["sig", "msig", "lsig", "sgnr"]);
const fixmapFirst = 0x80;
const fixmapLast = 0x8f;
const fixstrFirst = 0xa0;
const fixstrLast = 0xbf;

export const hashTag = (value: string): string => `sha256:${sha256Hex(value)}`;

function isSignedTransaction(bytes: Buffer): boolean {
  const mapHeader = bytes[0] ?? 0;
  const keyHeader = bytes[1] ?? 0;
  if (mapHeader < fixmapFirst || mapHeader > fixmapLast) {
    return false;
  }
  if (keyHeader < fixstrFirst || keyHeader > fixstrLast) {
    return false;
  }
  const keyLength = keyHeader - fixstrFirst;
  return signedTransactionKeys.has(bytes.subarray(2, 2 + keyLength).toString("latin1"));
}

function parsedJson(
  text: string,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    const value: unknown = JSON.parse(text);
    return { ok: true, value };
  } catch {
    return { ok: false };
  }
}

export type ContainsSecrets = (value: unknown) => boolean;

function isSecretBlob(token: string, containsSecrets: ContainsSecrets): boolean {
  const bytes = Buffer.from(token, "base64");
  if (isSignedTransaction(bytes)) {
    return true;
  }
  const text = bytes.toString("utf8");
  if (!text.startsWith("{") && !text.startsWith("[")) {
    return false;
  }
  const parsed = parsedJson(text);
  return parsed.ok && containsSecrets(parsed.value);
}

export function scrubSecretValues(text: string, containsSecrets: ContainsSecrets): string {
  return scrubMnemonics(text, hashTag).replace(base64Token, (token) =>
    isSecretBlob(token, containsSecrets) ? hashTag(token) : token,
  );
}
