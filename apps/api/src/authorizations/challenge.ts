import { timingSafeEqual } from "node:crypto";
import { randomToken, sha256Hex } from "../ids";

const nonceBytes = 32;
const prefix = "selo-verification=";

export const pendingChallengeMs = 3_600_000;

export interface Challenge {
  readonly nonce: string;
  readonly nonceHash: string;
  readonly expectedContent: string;
}

export function newChallenge(): Challenge {
  const nonce = randomToken(nonceBytes);
  return { nonce, nonceHash: sha256Hex(nonce), expectedContent: `${prefix}${nonce}` };
}

export function verificationUrl(origin: string): string {
  return `${origin}/.well-known/selo-verification.txt`;
}

function sameHash(candidate: string, expectedHash: string): boolean {
  const left = Buffer.from(sha256Hex(candidate), "hex");
  const right = Buffer.from(expectedHash, "hex");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function carriesNonce(file: string, expectedHash: string): boolean {
  return file
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith(prefix))
    .some((line) => sameHash(line.slice(prefix.length), expectedHash));
}
