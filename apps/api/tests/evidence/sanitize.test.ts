import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson, sha256Hex } from "../../src/evidence/canonical";
import { sanitize } from "../../src/evidence/sanitize";

const tag = (value: string) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

const mnemonic = Array.from({ length: 25 }, (_, index) => ["abandon", "zoo", "cable"][index % 3])
  .join(" ")
  .trim();

const signedTxn = Buffer.concat([
  Buffer.from([0x82, 0xa3]),
  Buffer.from("sig"),
  Buffer.from([0xc4, 0x40]),
  Buffer.alloc(64, 7),
  Buffer.from([0xa3]),
  Buffer.from("txn"),
  Buffer.alloc(40, 1),
]).toString("base64");

describe("sanitize", () => {
  it("hashes secret-named keys at any depth and redacts non-string secrets", () => {
    const input = {
      headers: { Authorization: "Bearer abc", cookie: "sid=1", "X-PAYMENT": "eyJ4" },
      nested: [{ deeper: { privateKey: "pk", apiKey: 42, password: { a: 1 } } }],
      paymentSignature: "sig-value",
      mnemonic: "words",
      clientSecret: null,
      plain: "keep me",
    };
    expect(sanitize(input)).toEqual({
      headers: { Authorization: tag("Bearer abc"), cookie: tag("sid=1"), "X-PAYMENT": tag("eyJ4") },
      nested: [{ deeper: { privateKey: tag("pk"), apiKey: "[redacted]", password: "[redacted]" } }],
      paymentSignature: tag("sig-value"),
      mnemonic: tag("words"),
      clientSecret: "[redacted]",
      plain: "keep me",
    });
    expect(input.headers.Authorization).toBe("Bearer abc");
  });

  it("truncates long strings and reports how much was cut", () => {
    const sanitized = sanitize({ body: "x".repeat(5_000) });
    expect(sanitized).toEqual({ body: `${"x".repeat(4_096)}…[truncated 904 chars]` });
  });

  it("hashes the full secret even when it is longer than the truncation limit", () => {
    const long = "s".repeat(5_000);
    expect(sanitize({ secret: long })).toEqual({ secret: tag(long) });
  });

  it("stops at depth 12", () => {
    let value: unknown = "leaf";
    for (let level = 0; level < 20; level += 1) {
      value = { next: value };
    }
    let cursor: unknown = sanitize(value);
    let depth = 0;
    while (typeof cursor === "object" && cursor !== null && "next" in cursor) {
      cursor = cursor.next;
      depth += 1;
    }
    expect(depth).toBe(12);
    expect(cursor).toBe("[depth limit]");
  });

  it("hashes a mnemonic or a signed transaction found in any field", () => {
    const sanitized = sanitize({
      note: mnemonic,
      prose: `Wallet: ${mnemonic}. Leaked`,
      payload: { paymentGroup: [signedTxn], paymentIndex: 0 },
    });
    expect(sanitized).toEqual({
      note: tag(mnemonic),
      prose: `Wallet: ${tag(mnemonic)}. Leaked`,
      payload: { paymentGroup: [tag(signedTxn)], paymentIndex: 0 },
    });
  });

  it("hashes a base64 payment header value that carries a signed payload", () => {
    const header = Buffer.from(
      JSON.stringify({ x402Version: 2, payload: { paymentGroup: [signedTxn] } }),
    ).toString("base64");
    expect(sanitize({ replayHeader: header })).toEqual({ replayHeader: tag(header) });
  });

  it("keeps ordinary identifiers and prose untouched", () => {
    const value = {
      txId: "7XGQ4N6K2ZL5P3VJ8M9R2T4W6Y8B1C3D5F7H9J2K4M6N8P1Q3R5S",
      hash: "a".repeat(64),
      text: "the quick brown fox jumps over the lazy dog",
      amount: 50_000,
      ok: true,
      none: null,
    };
    expect(sanitize(value)).toEqual(value);
  });

  it("serialises dates and bigints and drops undefined fields", () => {
    expect(
      sanitize({
        at: new Date("2026-09-27T00:00:00Z"),
        big: 10n,
        gone: undefined,
        list: [undefined],
      }),
    ).toEqual({ at: "2026-09-27T00:00:00.000Z", big: "10", list: [null] });
  });
});

describe("canonicalJson", () => {
  it("is stable across key order at every depth", () => {
    const left = { b: 1, a: { d: [1, { y: 2, x: 1 }], c: "z" } };
    const right = { a: { c: "z", d: [1, { x: 1, y: 2 }] }, b: 1 };
    expect(canonicalJson(left)).toBe(canonicalJson(right));
    expect(canonicalJson(left)).toBe('{"a":{"c":"z","d":[1,{"x":1,"y":2}]},"b":1}');
    expect(sha256Hex(canonicalJson(left))).toBe(sha256Hex(canonicalJson(right)));
  });

  it("hashes as lowercase hex sha256", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
