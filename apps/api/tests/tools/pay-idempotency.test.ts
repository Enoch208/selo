import { describe, expect, it } from "vitest";
import { idempotencyKeyPattern } from "../../src/release/request";
import { payIdempotencyKey } from "../../src/tools/pay-idempotency";

const payer = "PAYERADDRESS";

describe("payIdempotencyKey", () => {
  it("derives the same accepted key from the preflight and payer on every run", () => {
    const key = payIdempotencyKey("pfl_1", payer, undefined);
    expect(key).toEqual(payIdempotencyKey("pfl_1", payer, undefined));
    expect(key !== null && idempotencyKeyPattern.test(key)).toBe(true);
  });

  it("differs by preflight and by payer", () => {
    const key = payIdempotencyKey("pfl_1", payer, undefined);
    expect(payIdempotencyKey("pfl_2", payer, undefined)).not.toEqual(key);
    expect(payIdempotencyKey("pfl_1", "OTHERPAYER", undefined)).not.toEqual(key);
  });

  it("uses an explicit key verbatim when it is valid", () => {
    expect(payIdempotencyKey("pfl_1", payer, "my-release-42")).toBe("my-release-42");
  });

  it("rejects an explicit key Selo would refuse", () => {
    expect(payIdempotencyKey("pfl_1", payer, "short")).toBeNull();
    expect(payIdempotencyKey("pfl_1", payer, "has spaces in it")).toBeNull();
  });
});
