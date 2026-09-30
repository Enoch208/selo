import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sanitizeHeaders } from "../../src/payments/sanitize-headers";

const hashOf = (value: string): string =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

describe("sanitizeHeaders", () => {
  it("A22 (client): replaces every secret header with the SHA-256 of its value", () => {
    const secrets = {
      authorization: "Bearer abc",
      cookie: "session=1",
      "payment-signature": "c2lnbmVk",
      "x-payment": "djE=",
      "proxy-authorization": "Basic Zm9v",
    };
    const headers = new Headers({ ...secrets, "content-type": "application/json" });
    headers.append("set-cookie", "a=1");
    headers.append("set-cookie", "b=2");

    const sanitized = sanitizeHeaders(headers);

    for (const [name, value] of Object.entries(secrets)) {
      expect(sanitized[name]).toBe(hashOf(value));
    }
    expect(sanitized["set-cookie"]).toBe(`${hashOf("a=1")}, ${hashOf("b=2")}`);
    expect(sanitized["content-type"]).toBe("application/json");
    const serialised = JSON.stringify(sanitized);
    for (const value of [...Object.values(secrets), "a=1", "b=2"]) {
      expect(serialised).not.toContain(value);
    }
  });

  it("matches secret header names case-insensitively", () => {
    const sanitized = sanitizeHeaders(new Headers({ "PAYMENT-SIGNATURE": "c2ln" }));
    expect(sanitized).toEqual({ "payment-signature": hashOf("c2ln") });
  });
});
