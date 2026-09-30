import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../../src/evidence/canonical";
import { SafeFetchError } from "../../src/net/safe-fetch";
import {
  accept,
  catalog,
  getPreflight,
  jobMaxSpendMicros,
  mainnet,
  preflight,
  preflightRow,
  preflightRows,
  seedAuthorization,
  target,
  targetPayTo,
  targetUrl,
  testnet,
  ttlMinutes,
  usePreflightHarness,
} from "./harness";

usePreflightHarness();

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

async function onlyRow() {
  const rows = await preflightRows();
  expect(rows).toHaveLength(1);
  const [row] = rows;
  if (row === undefined) {
    throw new Error("expected one preflight row");
  }
  return row;
}

describe("POST /v1/preflight eligible", () => {
  it("returns 201 with price, estimate, Selo price and expiry, and persists what it saw", async () => {
    const authorizationId = await seedAuthorization();
    const before = Date.now();
    const reply = await preflight({ authorizationId, targetUrl, method: "GET" });
    expect(reply.status).toBe(201);
    expect(reply.body).toMatchObject({
      eligible: true,
      target: { url: targetUrl, method: "GET", priceUsdc: "0.01" },
      estimatedMaxSpendUsdc: "0.01",
      seloPriceUsdc: "1.00",
    });
    const preflightId = String(reply.body.preflightId);
    expect(preflightId).toMatch(/^pfl_[0-9A-Z]{26}$/);
    const expiresAt = Date.parse(String(reply.body.expiresAt));
    expect(expiresAt).toBeGreaterThanOrEqual(before + ttlMinutes * 60_000);
    expect(expiresAt).toBeLessThanOrEqual(Date.now() + ttlMinutes * 60_000);

    const row = await onlyRow();
    const challenge = target.challenge(targetUrl);
    expect(row).toMatchObject({
      id: preflightId,
      authorizationId,
      targetUrl,
      httpMethod: "GET",
      eligible: true,
      rejectionReason: null,
      paymentNetwork: mainnet.caip2,
      paymentAsset: mainnet.usdcAssetId,
      paymentAmountMicros: 10_000,
      payTo: targetPayTo,
      paymentRequirementsJson: challenge,
      paymentRequirementsHash: sha256(canonicalJson(challenge)),
      requestBodyJson: null,
    });
    expect(row.expiresAt.getTime()).toBe(expiresAt);
  });

  it("sends exactly one unpaid probe carrying the preflight id as Idempotency-Key", async () => {
    const authorizationId = await seedAuthorization();
    const reply = await preflight({ authorizationId, targetUrl, method: "GET" });
    expect(target.origins).toEqual(["https://api.example.com"]);
    expect(target.requests).toEqual([
      {
        method: "GET",
        url: targetUrl,
        idempotencyKey: `preflight-${String(reply.body.preflightId)}`,
        paymentSignature: null,
        body: "",
      },
    ]);
  });

  it("stores the optional request body and sends it with the probe", async () => {
    const authorizationId = await seedAuthorization({ method: "POST" });
    const requestBody = { query: "x402", limit: 3 };
    const reply = await preflight({ authorizationId, targetUrl, method: "POST", requestBody });
    expect(reply.status).toBe(201);
    expect(target.requests[0]).toMatchObject({ method: "POST", body: JSON.stringify(requestBody) });
    expect((await onlyRow()).requestBodyJson).toEqual(requestBody);
  });

  it("keeps only the allow-listed challenge keys", async () => {
    const authorizationId = await seedAuthorization();
    target.extraChallengeKeys = { internalNote: "drop me" };
    await preflight({ authorizationId, targetUrl, method: "GET" });
    expect((await onlyRow()).paymentRequirementsJson).toEqual(target.challenge(targetUrl));
  });

  it("picks the Selo-network requirement among several accepts", async () => {
    const authorizationId = await seedAuthorization();
    target.accepts = [
      accept({ network: testnet.caip2, asset: testnet.usdcAssetId, amount: "1" }),
      accept({ amount: "20000" }),
    ];
    const reply = await preflight({ authorizationId, targetUrl, method: "GET" });
    expect(reply.body).toMatchObject({ target: { priceUsdc: "0.02" } });
  });
});

describe("POST /v1/preflight catalog snapshot", () => {
  it("stores the catalog record and its hash when the target is listed", async () => {
    const record = { resourceUrl: targetUrl, method: "GET", settleCount: 3 };
    catalog.answer = { kind: "found", record };
    const authorizationId = await seedAuthorization();
    await preflight({ authorizationId, targetUrl, method: "GET" });
    expect(catalog.lookups).toEqual([{ resourceUrl: targetUrl, method: "GET" }]);
    expect(await onlyRow()).toMatchObject({
      discoveryJson: record,
      discoveryHash: sha256(canonicalJson(record)),
    });
  });

  it("stores no record when the target is not listed", async () => {
    catalog.answer = { kind: "not_found" };
    const authorizationId = await seedAuthorization();
    const reply = await preflight({ authorizationId, targetUrl, method: "GET" });
    expect(reply.status).toBe(201);
    expect(await onlyRow()).toMatchObject({ discoveryJson: null, discoveryHash: null });
  });

  it("looks up the exact target URL the caller supplied before the normalized href", async () => {
    const bareOrigin = "https://api.example.com";
    const record = { resourceUrl: bareOrigin, method: "GET" };
    catalog.answer = { kind: "found", record };
    catalog.listedUrl = bareOrigin;
    const authorizationId = await seedAuthorization({ routePath: "/" });
    const reply = await preflight({ authorizationId, targetUrl: bareOrigin, method: "GET" });
    expect(reply.status).toBe(201);
    expect(catalog.lookups).toEqual([{ resourceUrl: bareOrigin, method: "GET" }]);
    expect(await onlyRow()).toMatchObject({ targetUrl: `${bareOrigin}/`, discoveryJson: record });
  });

  it("falls back to the normalized href when the supplied URL is not listed", async () => {
    const normalized = "https://api.example.com/";
    const record = { resourceUrl: normalized, method: "GET" };
    catalog.answer = { kind: "found", record };
    catalog.listedUrl = normalized;
    const authorizationId = await seedAuthorization({ routePath: "/" });
    await preflight({ authorizationId, targetUrl: "https://api.example.com", method: "GET" });
    expect(catalog.lookups.map((lookup) => lookup.resourceUrl)).toEqual([
      "https://api.example.com",
      normalized,
    ]);
    expect(await onlyRow()).toMatchObject({ discoveryJson: record });
  });

  it("never blocks eligibility when the catalog is unavailable", async () => {
    catalog.answer = { kind: "unavailable", message: "HTTP 500" };
    const authorizationId = await seedAuthorization();
    const reply = await preflight({ authorizationId, targetUrl, method: "GET" });
    expect(reply.status).toBe(201);
    expect(await onlyRow()).toMatchObject({
      eligible: true,
      discoveryJson: null,
      discoveryHash: null,
    });
  });
});

describe("POST /v1/preflight rejections", () => {
  it("rejects a non-402 target as NO_PAYMENT_CHALLENGE", async () => {
    target.status = 200;
    const authorizationId = await seedAuthorization();
    const reply = await preflight({ authorizationId, targetUrl, method: "GET" });
    expect(reply).toMatchObject({
      status: 422,
      body: { eligible: false, reason: "NO_PAYMENT_CHALLENGE" },
    });
    const row = await onlyRow();
    expect(reply.body.preflightId).toBe(row.id);
    expect(row).toMatchObject({
      eligible: false,
      rejectionReason: "NO_PAYMENT_CHALLENGE",
      paymentRequirementsJson: null,
    });
  });

  it("maps a 5xx target to TARGET_UNREACHABLE", async () => {
    target.status = 503;
    const authorizationId = await seedAuthorization();
    const reply = await preflight({ authorizationId, targetUrl, method: "GET" });
    expect(reply).toMatchObject({ status: 422, body: { reason: "TARGET_UNREACHABLE" } });
  });

  it("rejects a challenge on another network as NETWORK_NOT_SUPPORTED", async () => {
    target.accepts = [accept({ network: testnet.caip2, asset: testnet.usdcAssetId })];
    const authorizationId = await seedAuthorization();
    const reply = await preflight({ authorizationId, targetUrl, method: "GET" });
    expect(reply).toMatchObject({ status: 422, body: { reason: "NETWORK_NOT_SUPPORTED" } });
    const row = await onlyRow();
    expect(row).toMatchObject({ eligible: false, rejectionReason: "NETWORK_NOT_SUPPORTED" });
    expect(row.paymentRequirementsJson).toEqual(target.challenge(targetUrl));
  });

  it("rejects a challenge in another asset on the right network as ASSET_NOT_SUPPORTED", async () => {
    target.accepts = [accept({ asset: "12345" })];
    const authorizationId = await seedAuthorization();
    const reply = await preflight({ authorizationId, targetUrl, method: "GET" });
    expect(reply).toMatchObject({ status: 422, body: { reason: "ASSET_NOT_SUPPORTED" } });
    expect(await onlyRow()).toMatchObject({ rejectionReason: "ASSET_NOT_SUPPORTED" });
  });

  it("A11 (preflight): a target priced above the job budget is ineligible", async () => {
    target.accepts = [accept({ amount: String(jobMaxSpendMicros + 1) })];
    const authorizationId = await seedAuthorization();
    const reply = await preflight({ authorizationId, targetUrl, method: "GET" });
    expect(reply).toMatchObject({
      status: 422,
      body: { eligible: false, reason: "PRICE_OVER_BUDGET" },
    });
    const row = await onlyRow();
    expect(reply.body.preflightId).toBe(row.id);
    expect(row).toMatchObject({
      eligible: false,
      rejectionReason: "PRICE_OVER_BUDGET",
      paymentAmountMicros: jobMaxSpendMicros + 1,
      payTo: targetPayTo,
    });
    expect(catalog.lookups).toEqual([]);
  });

  it("accepts a target priced exactly at the job budget", async () => {
    target.accepts = [accept({ amount: String(jobMaxSpendMicros) })];
    const authorizationId = await seedAuthorization();
    const reply = await preflight({ authorizationId, targetUrl, method: "GET" });
    expect(reply).toMatchObject({ status: 201, body: { target: { priceUsdc: "0.50" } } });
  });

  it("maps a probe timeout to TARGET_UNREACHABLE", async () => {
    target.failure = new SafeFetchError({ kind: "timeout" });
    const authorizationId = await seedAuthorization();
    const reply = await preflight({ authorizationId, targetUrl, method: "GET" });
    expect(reply).toMatchObject({ status: 422, body: { reason: "TARGET_UNREACHABLE" } });
    expect(await onlyRow()).toMatchObject({
      eligible: false,
      rejectionReason: "TARGET_UNREACHABLE",
    });
  });

  it("maps a probe network failure to TARGET_UNREACHABLE", async () => {
    target.failure = new SafeFetchError({ kind: "network" }, new Error("ECONNREFUSED"));
    const authorizationId = await seedAuthorization();
    const reply = await preflight({ authorizationId, targetUrl, method: "GET" });
    expect(reply).toMatchObject({ status: 422, body: { reason: "TARGET_UNREACHABLE" } });
  });

  it("maps a blocked probe to TARGET_ADDRESS_BLOCKED", async () => {
    target.failure = new SafeFetchError(
      { kind: "blocked", reason: "TARGET_ADDRESS_BLOCKED" },
      undefined,
      false,
    );
    const authorizationId = await seedAuthorization();
    const reply = await preflight({ authorizationId, targetUrl, method: "GET" });
    expect(reply).toMatchObject({ status: 422, body: { reason: "TARGET_ADDRESS_BLOCKED" } });
    expect(await onlyRow()).toMatchObject({ rejectionReason: "TARGET_ADDRESS_BLOCKED" });
  });
});

describe("POST /v1/preflight authorization", () => {
  it("rejects an unknown authorization with 403 AUTHORIZATION_MISSING and no probe", async () => {
    const reply = await preflight({
      authorizationId: "auth_00000000000000000000000000",
      targetUrl,
      method: "GET",
    });
    expect(reply).toMatchObject({
      status: 403,
      body: { eligible: false, preflightId: null, reason: "AUTHORIZATION_MISSING" },
    });
    expect(target.requests).toEqual([]);
    expect(await preflightRows()).toEqual([]);
  });

  it("rejects an expired authorization with 403 AUTHORIZATION_EXPIRED and no probe", async () => {
    const authorizationId = await seedAuthorization({ expiresAt: new Date(Date.now() - 1_000) });
    const reply = await preflight({ authorizationId, targetUrl, method: "GET" });
    expect(reply).toMatchObject({ status: 403, body: { reason: "AUTHORIZATION_EXPIRED" } });
    expect(target.requests).toEqual([]);
    const row = await onlyRow();
    expect(reply.body.preflightId).toBe(row.id);
    expect(row).toMatchObject({
      authorizationId,
      eligible: false,
      rejectionReason: "AUTHORIZATION_EXPIRED",
    });
  });

  it("rejects a pending (unverified) authorization with 403 AUTHORIZATION_EXPIRED", async () => {
    const authorizationId = await seedAuthorization({ status: "PENDING" });
    const reply = await preflight({ authorizationId, targetUrl, method: "GET" });
    expect(reply).toMatchObject({ status: 403, body: { reason: "AUTHORIZATION_EXPIRED" } });
    expect(target.requests).toEqual([]);
  });

  it("rejects an authorization for another path with 403 AUTHORIZATION_MISSING", async () => {
    const authorizationId = await seedAuthorization({ routePath: "/v1/other" });
    const reply = await preflight({ authorizationId, targetUrl, method: "GET" });
    expect(reply).toMatchObject({ status: 403, body: { reason: "AUTHORIZATION_MISSING" } });
    expect(target.requests).toEqual([]);
    const row = await onlyRow();
    expect(reply.body.preflightId).toBe(row.id);
    expect(row).toMatchObject({ rejectionReason: "AUTHORIZATION_MISSING" });
  });

  it("rejects an authorization for another method with 403 AUTHORIZATION_MISSING", async () => {
    const authorizationId = await seedAuthorization({ method: "POST" });
    const reply = await preflight({ authorizationId, targetUrl, method: "GET" });
    expect(reply).toMatchObject({ status: 403, body: { reason: "AUTHORIZATION_MISSING" } });
    expect(target.requests).toEqual([]);
  });
});

describe("POST /v1/preflight input", () => {
  it("rejects a non-https target with 400 TARGET_NOT_HTTPS and no row", async () => {
    const authorizationId = await seedAuthorization();
    const reply = await preflight({
      authorizationId,
      targetUrl: "http://api.example.com/v1/quote",
      method: "GET",
    });
    expect(reply).toMatchObject({
      status: 400,
      body: { eligible: false, preflightId: null, reason: "TARGET_NOT_HTTPS" },
    });
    expect(await preflightRows()).toEqual([]);
  });

  it("rejects an unparseable target with 400 TARGET_URL_INVALID", async () => {
    const authorizationId = await seedAuthorization();
    const reply = await preflight({ authorizationId, targetUrl: "not a url", method: "GET" });
    expect(reply).toMatchObject({ status: 400, body: { reason: "TARGET_URL_INVALID" } });
  });

  it("rejects a malformed body with 400", async () => {
    const reply = await preflight({ targetUrl, method: "DELETE" });
    expect(reply.status).toBe(400);
    expect(reply.body).toMatchObject({ error: "VALIDATION_FAILED" });
  });

  it("rejects a request body larger than 16 KiB with 400", async () => {
    const authorizationId = await seedAuthorization({ method: "POST" });
    const reply = await preflight({
      authorizationId,
      targetUrl,
      method: "POST",
      requestBody: { blob: "x".repeat(16 * 1024) },
    });
    expect(reply).toMatchObject({ status: 400, body: { error: "VALIDATION_FAILED" } });
    expect(target.requests).toEqual([]);
  });

  it("rejects a request body on a GET with 400", async () => {
    const authorizationId = await seedAuthorization();
    const reply = await preflight({ authorizationId, targetUrl, method: "GET", requestBody: {} });
    expect(reply).toMatchObject({ status: 400, body: { error: "VALIDATION_FAILED" } });
  });

  it("rejects a top-level null request body with 400 and sends nothing", async () => {
    const authorizationId = await seedAuthorization({ method: "POST" });
    const reply = await preflight({
      authorizationId,
      targetUrl,
      method: "POST",
      requestBody: null,
    });
    expect(reply).toMatchObject({ status: 400, body: { error: "VALIDATION_FAILED" } });
    expect(target.requests).toEqual([]);
    expect(await preflightRows()).toEqual([]);
  });

  it("accepts null nested inside a request body", async () => {
    const authorizationId = await seedAuthorization({ method: "POST" });
    const requestBody = { cursor: null };
    const reply = await preflight({ authorizationId, targetUrl, method: "POST", requestBody });
    expect(reply.status).toBe(201);
    expect((await onlyRow()).requestBodyJson).toEqual(requestBody);
  });
});

describe("GET /v1/preflight/:id", () => {
  it("returns the stored eligible view", async () => {
    const authorizationId = await seedAuthorization();
    const created = await preflight({ authorizationId, targetUrl, method: "GET" });
    const read = await getPreflight(String(created.body.preflightId));
    expect(read).toEqual({ status: 200, body: created.body });
  });

  it("returns the stored ineligible view", async () => {
    target.status = 200;
    const authorizationId = await seedAuthorization();
    const created = await preflight({ authorizationId, targetUrl, method: "GET" });
    const [row] = await preflightRows();
    expect(created.body.preflightId).toBe(row?.id);
    const read = await getPreflight(row?.id ?? "");
    expect(read).toEqual({ status: 200, body: created.body });
    expect(await preflightRow(row?.id ?? "")).toMatchObject({ eligible: false });
  });

  it("answers 404 for an unknown preflight", async () => {
    expect((await getPreflight("pfl_00000000000000000000000000")).status).toBe(404);
    expect((await getPreflight("nope")).status).toBe(404);
  });
});
