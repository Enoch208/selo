import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { errorOf, localSafeFetch, safeErrorOf } from "./safe-fetch-harness";
import {
  fixtureOrigin,
  opensslAvailable,
  startTlsFixture,
  unusedPort,
  type TlsFixture,
} from "./tls-fixture";

let fixture: TlsFixture;
const neverResolves = () => new Promise<readonly string[]>(() => undefined);

describe.skipIf(!opensslAvailable)(
  "safe fetch: timeouts, aborts and network failures (local HTTPS fixture; skipped when openssl is absent)",
  () => {
    beforeAll(async () => {
      fixture = await startTlsFixture({ "/hang": () => undefined });
    });

    afterAll(async () => {
      await fixture.close();
    });

    it("types a whole-request timeout after dispatch as timeout", async () => {
      const safeFetch = localSafeFetch({ port: fixture.port, timeoutMs: 300 });
      const error = await safeErrorOf(safeFetch(`${fixtureOrigin}/hang`));
      expect(error.failure).toEqual({ kind: "timeout" });
      expect(error.afterDispatch).toBe(true);
      expect(error.cause).toBeDefined();
    });

    it("types a DNS resolution that outlives the timeout as a pre-dispatch timeout", async () => {
      const safeFetch = localSafeFetch({
        port: fixture.port,
        timeoutMs: 100,
        resolve: neverResolves,
      });
      const error = await safeErrorOf(safeFetch(`${fixtureOrigin}/hang`));
      expect(error.failure).toEqual({ kind: "timeout" });
      expect(error.afterDispatch).toBe(false);
    });

    it("types a caller signal that aborts with a TimeoutError as timeout", async () => {
      const safeFetch = localSafeFetch({ port: fixture.port, timeoutMs: 5_000 });
      const error = await safeErrorOf(
        safeFetch(`${fixtureOrigin}/hang`, { signal: AbortSignal.timeout(150) }),
      );
      expect(error.failure).toEqual({ kind: "timeout" });
      expect(error.afterDispatch).toBe(true);
      expect(error.cause).toBeInstanceOf(DOMException);
    });

    it("types a caller TimeoutError during DNS as a pre-dispatch timeout", async () => {
      const safeFetch = localSafeFetch({ port: fixture.port, resolve: neverResolves });
      const error = await safeErrorOf(
        safeFetch(`${fixtureOrigin}/hang`, { signal: AbortSignal.timeout(100) }),
      );
      expect(error.failure).toEqual({ kind: "timeout" });
      expect(error.afterDispatch).toBe(false);
    });

    it("propagates any other caller abort reason unchanged", async () => {
      const controller = new AbortController();
      const reason = new Error("job cancelled");
      const pending = localSafeFetch({ port: fixture.port })(`${fixtureOrigin}/hang`, {
        signal: controller.signal,
      });
      setTimeout(() => {
        controller.abort(reason);
      }, 50);
      expect(await errorOf(pending)).toBe(reason);
    });

    it("propagates a caller abort during DNS resolution unchanged", async () => {
      const controller = new AbortController();
      const reason = new Error("job cancelled");
      const pending = localSafeFetch({ port: fixture.port, resolve: neverResolves })(
        `${fixtureOrigin}/hang`,
        {
          signal: controller.signal,
        },
      );
      controller.abort(reason);
      expect(await errorOf(pending)).toBe(reason);
    });

    it("types a refused connection as network, conservatively marked after dispatch", async () => {
      const safeFetch = localSafeFetch({ port: await unusedPort() });
      const error = await safeErrorOf(safeFetch(`${fixtureOrigin}/hang`));
      expect(error.failure).toEqual({ kind: "network" });
      expect(error.afterDispatch).toBe(true);
      expect(error.cause).toBeDefined();
    });

    it("types a DNS failure as a pre-dispatch network failure and keeps the cause", async () => {
      const dnsError = Object.assign(new Error("getaddrinfo ENOTFOUND"), { code: "ENOTFOUND" });
      const resolve = () => Promise.reject(dnsError);
      const error = await safeErrorOf(
        localSafeFetch({ port: fixture.port, resolve })(`${fixtureOrigin}/hang`),
      );
      expect(error.failure).toEqual({ kind: "network" });
      expect(error.afterDispatch).toBe(false);
      expect(error.cause).toBe(dnsError);
    });

    it("types an empty DNS answer as a pre-dispatch network failure", async () => {
      const resolve = () => Promise.resolve([]);
      const error = await safeErrorOf(
        localSafeFetch({ port: fixture.port, resolve })(`${fixtureOrigin}/hang`),
      );
      expect(error.failure).toEqual({ kind: "network" });
      expect(error.afterDispatch).toBe(false);
    });
  },
);
