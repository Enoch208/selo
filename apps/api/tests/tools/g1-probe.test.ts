import { encodePaymentRequiredHeader } from "@x402/core/http";
import type { PaymentRequired } from "@x402/core/types";
import { describe, expect, it } from "vitest";
import type { ToolFetch } from "../../src/tools/facilitator-client";
import { probeRelease } from "../../src/tools/g1-probe";
import { seloAccept } from "./fake-selo";

const challenge: PaymentRequired = {
  x402Version: 2,
  resource: { url: "https://selo.test/v1/release-test", description: "d", mimeType: "" },
  accepts: [seloAccept("algorand-mainnet")],
};

describe("probeRelease", () => {
  it("sends one unpaid, valid release body and decodes the 402", async () => {
    const seen: { url: string; init: RequestInit | undefined }[] = [];
    const fetch: ToolFetch = (url, init) => {
      seen.push({ url, init });
      const headers = { "PAYMENT-REQUIRED": encodePaymentRequiredHeader(challenge) };
      return Promise.resolve(new Response("{}", { status: 402, headers }));
    };
    const probe = await probeRelease(fetch, "selo.test", "pfl_1");
    expect(probe).toEqual({
      ok: true,
      value: { status: 402, decoded: challenge, decodeError: null },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url).toBe("https://selo.test/v1/release-test");
    expect(seen[0]?.init?.method).toBe("POST");
    expect(seen[0]?.init?.body).toBe('{"preflightId":"pfl_1","profile":"quick"}');
    expect(new Headers(seen[0]?.init?.headers).has("PAYMENT-SIGNATURE")).toBe(false);
  });

  it("does not follow a redirect and reports it", async () => {
    const seen: (RequestInit | undefined)[] = [];
    const fetch: ToolFetch = (_url, init) => {
      seen.push(init);
      const headers = { location: "https://elsewhere.test/x" };
      return Promise.resolve(new Response(null, { status: 308, headers }));
    };
    const probe = await probeRelease(fetch, "selo.test", "pfl_1");
    expect(seen.map((init) => init?.redirect)).toEqual(["manual"]);
    expect(probe).toEqual({
      ok: false,
      reason:
        "https://selo.test/v1/release-test: target redirected (HTTP 308 to https://elsewhere.test/x); nothing further sent",
    });
  });

  it("reports a network failure instead of throwing", async () => {
    const fetch: ToolFetch = () => Promise.reject(new TypeError("fetch failed"));
    const probe = await probeRelease(fetch, "selo.test", "pfl_1");
    expect(probe).toEqual({
      ok: false,
      reason: "https://selo.test/v1/release-test: fetch failed",
    });
  });
});
