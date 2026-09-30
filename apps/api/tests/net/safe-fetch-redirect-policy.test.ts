import type { IncomingMessage, ServerResponse } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { localSafeFetch, safeErrorOf } from "./safe-fetch-harness";
import { fixtureOrigin, opensslAvailable, startTlsFixture, type TlsFixture } from "./tls-fixture";

const hits: string[] = [];
let fixture: TlsFixture;

const secretHeaders = {
  "payment-signature": "signed-payment",
  "x-payment": "legacy-signed-payment",
  authorization: "Bearer secret",
  cookie: "session=secret",
  "proxy-authorization": "Basic secret",
} as const;

const redirectTo =
  (status: number, location: string) => (request: IncomingMessage, response: ServerResponse) => {
    hits.push(request.url ?? "");
    response.writeHead(status, { location }).end("moved");
  };

function echoHeaders(request: IncomingMessage, response: ServerResponse): void {
  hits.push(request.url ?? "");
  const seen = Object.fromEntries(
    [...Object.keys(secretHeaders), "x-trace"].map((name) => [name, request.headers[name] ?? null]),
  );
  response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(seen));
}

describe.skipIf(!opensslAvailable)(
  "safe fetch: redirect policy and secret headers (local HTTPS fixture; skipped when openssl is absent)",
  () => {
    beforeAll(async () => {
      fixture = await startTlsFixture({
        "/302": redirectTo(302, "/headers"),
        "/303": redirectTo(303, "/headers"),
        "/307": redirectTo(307, "/headers"),
        "/308": redirectTo(308, "/headers"),
        "/headers": echoHeaders,
      });
    });

    afterAll(async () => {
      await fixture.close();
    });

    beforeEach(() => {
      hits.length = 0;
    });

    it("returns the redirect unfollowed when a paid request asks for manual redirects", async () => {
      const response = await localSafeFetch({ port: fixture.port })(`${fixtureOrigin}/302`, {
        headers: secretHeaders,
        redirect: "manual",
      });
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe("/headers");
      expect(hits).toEqual(["/302"]);
    });

    it("throws a typed after-dispatch block when redirects are an error", async () => {
      const pending = localSafeFetch({ port: fixture.port })(`${fixtureOrigin}/307`, {
        redirect: "error",
      });
      const error = await safeErrorOf(pending);
      expect(error.failure).toEqual({ kind: "blocked", reason: "REDIRECT_NOT_ALLOWED" });
      expect(error.afterDispatch).toBe(true);
      expect(hits).toEqual(["/307"]);
    });

    it.each(["/302", "/303", "/307", "/308"])(
      "never forwards payment or credential headers past a followed %s",
      async (path) => {
        const response = await localSafeFetch({ port: fixture.port })(`${fixtureOrigin}${path}`, {
          headers: { ...secretHeaders, "x-trace": "kept" },
        });
        expect(await response.json()).toEqual({
          "payment-signature": null,
          "x-payment": null,
          authorization: null,
          cookie: null,
          "proxy-authorization": null,
          "x-trace": "kept",
        });
        expect(hits).toEqual([path, "/headers"]);
      },
    );
  },
);
