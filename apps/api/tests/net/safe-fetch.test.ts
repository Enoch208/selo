import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { classifyAddress } from "@selo/core";
import { SafeFetchError } from "../../src/net/safe-fetch";
import { errorOf, failureOf, localSafeFetch, safeErrorOf } from "./safe-fetch-harness";
import { fixtureOrigin, opensslAvailable, startTlsFixture, type TlsFixture } from "./tls-fixture";

const hits: string[] = [];
let fixture: TlsFixture;

describe.skipIf(!opensslAvailable)(
  "safe fetch: address vetting and pinning (local HTTPS fixture; skipped when openssl is absent)",
  () => {
    beforeAll(async () => {
      fixture = await startTlsFixture({
        "/ok": (request, response) => {
          hits.push(request.url ?? "");
          response.writeHead(200, { "content-type": "application/json" }).end('{"hello":"world"}');
        },
        "/hang": (request) => {
          hits.push(request.url ?? "");
        },
      });
    });

    afterAll(async () => {
      await fixture.close();
    });

    beforeEach(() => {
      hits.length = 0;
    });

    it("fetches through the vetted address while TLS still validates the hostname", async () => {
      const response = await localSafeFetch({ port: fixture.port })(`${fixtureOrigin}/ok#ignored`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/json");
      expect(await response.json()).toEqual({ hello: "world" });
      expect(hits).toEqual(["/ok"]);
    });

    it("types a certificate that does not match the hostname as network", async () => {
      const safeFetch = localSafeFetch({
        port: fixture.port,
        allowedOrigin: "https://wrong-name.example",
      });
      const error = await errorOf(safeFetch("https://wrong-name.example/ok"));
      expect(error).toBeInstanceOf(SafeFetchError);
      expect(error instanceof SafeFetchError && error.failure).toEqual({ kind: "network" });
      expect(error instanceof SafeFetchError && error.cause).toBeDefined();
      expect(hits).toEqual([]);
    });

    it("A10: private-network target cannot be fetched", async () => {
      for (const address of ["10.0.0.5", "127.0.0.1", "169.254.169.254", "fd00:ec2::254"]) {
        const resolve = () => Promise.resolve([address]);
        const safeFetch = localSafeFetch({
          port: fixture.port,
          resolve,
          classify: classifyAddress,
        });
        const error = await safeErrorOf(safeFetch(`${fixtureOrigin}/ok`));
        expect(error.failure, address).toEqual({
          kind: "blocked",
          reason: "TARGET_ADDRESS_BLOCKED",
        });
        expect(error.afterDispatch, address).toBe(false);
      }
      expect(hits).toEqual([]);
    });

    it("blocks when any resolved record is private even if another is public", async () => {
      const resolve = () => Promise.resolve(["127.0.0.1", "10.0.0.5"]);
      const failure = await failureOf(
        localSafeFetch({ port: fixture.port, resolve })(`${fixtureOrigin}/ok`),
      );
      expect(failure).toEqual({ kind: "blocked", reason: "TARGET_ADDRESS_BLOCKED" });
      expect(hits).toEqual([]);
    });

    it("blocks an unparseable resolver answer", async () => {
      const resolve = () => Promise.resolve(["not-an-address"]);
      const failure = await failureOf(
        localSafeFetch({ port: fixture.port, resolve })(`${fixtureOrigin}/ok`),
      );
      expect(failure).toEqual({ kind: "blocked", reason: "TARGET_ADDRESS_BLOCKED" });
    });

    it.each([
      ["http://selo-test.example/ok", "TARGET_NOT_HTTPS"],
      ["https://other.example/ok", "ORIGIN_NOT_ALLOWED"],
      ["https://127.0.0.1/ok", "TARGET_ADDRESS_BLOCKED"],
      ["https://selo-test.example:8443/ok", "TARGET_ADDRESS_BLOCKED"],
      ["not a url", "TARGET_URL_INVALID"],
    ] as const)("blocks %s before any connection as %s", async (url, reason) => {
      const error = await safeErrorOf(localSafeFetch({ port: fixture.port })(url));
      expect(error.failure).toEqual({ kind: "blocked", reason });
      expect(error.afterDispatch).toBe(false);
      expect(hits).toEqual([]);
    });
  },
);
