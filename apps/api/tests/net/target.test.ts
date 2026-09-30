import { describe, expect, it } from "vitest";
import { parseTarget } from "../../src/net/target";

describe("parseTarget", () => {
  it("accepts an https URL, drops the fragment and keeps the query", () => {
    expect(parseTarget("https://API.Example.com:443/v1/quote?x=1&y=2#section")).toEqual({
      ok: true,
      target: {
        href: "https://api.example.com/v1/quote?x=1&y=2",
        origin: "https://api.example.com",
        hostname: "api.example.com",
        path: "/v1/quote",
      },
    });
  });

  it.each([
    ["not a url", "TARGET_URL_INVALID"],
    ["", "TARGET_URL_INVALID"],
    ["https://", "TARGET_URL_INVALID"],
    ["https://user:secret@api.example.com/v1", "TARGET_URL_INVALID"],
    ["https://user@api.example.com/v1", "TARGET_URL_INVALID"],
    ["http://api.example.com/v1", "TARGET_NOT_HTTPS"],
    ["ftp://api.example.com/v1", "TARGET_NOT_HTTPS"],
    ["file:///etc/passwd", "TARGET_NOT_HTTPS"],
    ["https://api.example.com:8443/v1", "TARGET_ADDRESS_BLOCKED"],
    ["https://api.example.com:80/v1", "TARGET_ADDRESS_BLOCKED"],
    ["https://127.0.0.1/v1", "TARGET_ADDRESS_BLOCKED"],
    ["https://8.8.8.8/v1", "TARGET_ADDRESS_BLOCKED"],
    ["https://2130706433/v1", "TARGET_ADDRESS_BLOCKED"],
    ["https://0x7f.1/v1", "TARGET_ADDRESS_BLOCKED"],
    ["https://[::1]/v1", "TARGET_ADDRESS_BLOCKED"],
    ["https://[::ffff:169.254.169.254]/v1", "TARGET_ADDRESS_BLOCKED"],
    ["https://localhost/v1", "TARGET_ADDRESS_BLOCKED"],
    ["https://LOCALHOST./v1", "TARGET_ADDRESS_BLOCKED"],
    ["https://api.local/v1", "TARGET_ADDRESS_BLOCKED"],
    ["https://metadata.google.internal/computeMetadata/v1", "TARGET_ADDRESS_BLOCKED"],
    ["https://intranet/v1", "TARGET_ADDRESS_BLOCKED"],
  ] as const)("rejects %s as %s", (raw, reason) => {
    expect(parseTarget(raw)).toEqual({ ok: false, reason });
  });
});
