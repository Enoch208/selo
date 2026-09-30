import { describe, expect, it } from "vitest";
import { liveProbeFetch } from "../../src/preflight/deps";
import { probeTarget } from "../../src/preflight/probe";
import {
  appWith,
  preflight,
  preflightDeps,
  preflightRows,
  seedAuthorization,
  usePreflightHarness,
} from "./harness";

usePreflightHarness();

describe("A10 private targets", () => {
  it("A10: a private-network target is rejected before any request", async () => {
    const factoryCalls: string[] = [];
    const app = appWith(
      preflightDeps((allowedOrigin) => {
        factoryCalls.push(allowedOrigin);
        return liveProbeFetch(allowedOrigin);
      }),
    );
    const authorizationId = await seedAuthorization();
    for (const targetUrl of ["https://10.0.0.5/x", "https://[::1]/x", "https://printer.local/x"]) {
      const reply = await preflight({ authorizationId, targetUrl, method: "GET" }, app);
      expect(reply, targetUrl).toMatchObject({
        status: 422,
        body: { eligible: false, reason: "TARGET_ADDRESS_BLOCKED" },
      });
    }
    expect(factoryCalls).toEqual([]);
    expect(await preflightRows()).toEqual([]);
  });

  it("A10: the production probe fetch refuses a private address with no request sent", async () => {
    const outcome = await probeTarget(liveProbeFetch("https://10.0.0.5"), {
      url: "https://10.0.0.5/x",
      method: "GET",
      operationId: "preflight-a10",
    });
    expect(outcome).toEqual({ kind: "blocked", reason: "TARGET_ADDRESS_BLOCKED" });
  });
});
