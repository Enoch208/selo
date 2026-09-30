import { createHash, randomBytes } from "node:crypto";

export type IdPrefix = "auth" | "pfl" | "job" | "scn" | "pay" | "evd";

const crockford = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const idBytes = 16;

function encodeCrockford(bytes: Uint8Array): string {
  let bits = 0;
  let buffer = 0;
  let encoded = "";
  for (const byte of bytes) {
    buffer = ((buffer << 8) | byte) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += crockford.charAt((buffer >> bits) & 31);
    }
  }
  if (bits > 0) {
    encoded += crockford.charAt((buffer << (5 - bits)) & 31);
  }
  return encoded;
}

export function newId(prefix: IdPrefix): string {
  return `${prefix}_${encodeCrockford(crypto.getRandomValues(new Uint8Array(idBytes)))}`;
}

export function isId(prefix: IdPrefix, value: string): boolean {
  return new RegExp(`^${prefix}_[${crockford}]{26}$`).test(value);
}

export function randomToken(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
