import type { ServerResponse } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { localSafeFetch, safeErrorOf } from "./safe-fetch-harness";
import {
  fixtureOrigin,
  opensslAvailable,
  readBody,
  startTlsFixture,
  type TlsFixture,
} from "./tls-fixture";

const hits: string[] = [];
let fixture: TlsFixture;

const redirectTo = (status: number, location: string) => (_: unknown, response: ServerResponse) => {
  response.writeHead(status, { location }).end("moved");
};

describe.skipIf(!opensslAvailable)(
  "safe fetch: redirects (local HTTPS fixture; skipped when openssl is absent)",
  () => {
    beforeAll(async () => {
      const tracked = (path: string, status: number, location: string) => ({
        [path]: (request: { url?: string | undefined }, response: ServerResponse) => {
          hits.push(request.url ?? "");
          redirectTo(status, location)(request, response);
        },
      });
      fixture = await startTlsFixture({
        ...tracked("/loop", 302, "/loop"),
        ...tracked("/hops/3", 302, "/hops/2"),
        ...tracked("/hops/2", 301, `${fixtureOrigin}/hops/1`),
        ...tracked("/hops/1", 302, "/hops/0"),
        ...tracked("/to-private", 302, "/landing"),
        ...tracked("/to-other-origin", 302, "https://other.example/landing"),
        ...tracked("/to-http", 302, "http://selo-test.example/landing"),
        ...tracked("/to-ip", 302, "https://169.254.169.254/latest/meta-data"),
        ...tracked("/301", 301, "/echo"),
        ...tracked("/302", 302, "/echo"),
        ...tracked("/303", 303, "/echo"),
        ...tracked("/307", 307, "/echo"),
        ...tracked("/308", 308, "/echo"),
        "/no-location": (request, response) => {
          hits.push(request.url ?? "");
          response.writeHead(302).end();
        },
        "/hops/0": (request, response) => {
          hits.push(request.url ?? "");
          response.writeHead(200).end("arrived");
        },
        "/landing": (request, response) => {
          hits.push(request.url ?? "");
          response.writeHead(200).end("landed");
        },
        "/echo": (request, response) => {
          hits.push(request.url ?? "");
          void readBody(request).then((body) => {
            const echoed = { method: request.method, body, type: request.headers["content-type"] };
            response
              .writeHead(200, { "content-type": "application/json" })
              .end(JSON.stringify(echoed));
          });
        },
      });
    });

    afterAll(async () => {
      await fixture.close();
    });

    beforeEach(() => {
      hits.length = 0;
    });

    it("follows up to three redirects, re-vetting each hop", async () => {
      let resolutions = 0;
      const resolve = () => {
        resolutions += 1;
        return Promise.resolve(["127.0.0.1"]);
      };
      const response = await localSafeFetch({ port: fixture.port, resolve })(
        `${fixtureOrigin}/hops/3`,
      );
      expect(await response.text()).toBe("arrived");
      expect(hits).toEqual(["/hops/3", "/hops/2", "/hops/1", "/hops/0"]);
      expect(resolutions).toBe(4);
    });

    it("blocks the fourth redirect", async () => {
      const error = await safeErrorOf(
        localSafeFetch({ port: fixture.port })(`${fixtureOrigin}/loop`),
      );
      expect(error.failure).toEqual({ kind: "blocked", reason: "TOO_MANY_REDIRECTS" });
      expect(error.afterDispatch).toBe(true);
      expect(hits).toEqual(["/loop", "/loop", "/loop", "/loop"]);
    });

    it("blocks a redirect whose hop now resolves to a private address", async () => {
      const answers = [["127.0.0.1"], ["10.0.0.7"]];
      const resolve = () => Promise.resolve(answers.shift() ?? []);
      const pending = localSafeFetch({ port: fixture.port, resolve })(
        `${fixtureOrigin}/to-private`,
      );
      const error = await safeErrorOf(pending);
      expect(error.failure).toEqual({ kind: "blocked", reason: "TARGET_ADDRESS_BLOCKED" });
      expect(error.afterDispatch).toBe(true);
      expect(hits).toEqual(["/to-private"]);
    });

    it.each([
      ["/to-other-origin", "ORIGIN_NOT_ALLOWED"],
      ["/to-http", "TARGET_NOT_HTTPS"],
      ["/to-ip", "TARGET_ADDRESS_BLOCKED"],
    ] as const)(
      "blocks the redirect from %s as %s, marked after dispatch",
      async (path, reason) => {
        const error = await safeErrorOf(
          localSafeFetch({ port: fixture.port })(`${fixtureOrigin}${path}`),
        );
        expect(error.failure).toEqual({ kind: "blocked", reason });
        expect(error.afterDispatch).toBe(true);
        expect(hits).toEqual([path]);
      },
    );

    it.each(["/301", "/302", "/303"])(
      "switches a POST to a bodiless GET after %s",
      async (path) => {
        const response = await localSafeFetch({ port: fixture.port })(`${fixtureOrigin}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '{"a":1}',
        });
        expect(await response.json()).toEqual({ method: "GET", body: "" });
      },
    );

    it.each(["/307", "/308"])("preserves the method and body after %s", async (path) => {
      const response = await localSafeFetch({ port: fixture.port })(`${fixtureOrigin}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: '{"a":1}',
      });
      expect(await response.json()).toEqual({
        method: "POST",
        body: '{"a":1}',
        type: "application/json",
      });
    });

    it("accepts a Request object as the x402 fetch wrapper passes it", async () => {
      const request = new Request(`${fixtureOrigin}/307`, {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: "paid",
      });
      const response = await localSafeFetch({ port: fixture.port })(request);
      expect(await response.json()).toEqual({ method: "POST", body: "paid", type: "text/plain" });
    });

    it("returns a redirect without a location as the final response", async () => {
      const response = await localSafeFetch({ port: fixture.port })(`${fixtureOrigin}/no-location`);
      expect(response.status).toBe(302);
      expect(hits).toEqual(["/no-location"]);
    });
  },
);
