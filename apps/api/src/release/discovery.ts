import type { ReleaseTestBody, ReleaseTestResponse } from "@selo/core";

export const releaseTestRoute = "POST /v1/release-test";

export const challengeTag = "x402-global-challenge";

export const releaseTestDescription =
  "Run an authorized x402 release test. Selo settles the request, pays the target endpoint, verifies payment and response behavior, and returns an evidence-backed PASS, FAIL, or INCONCLUSIVE report.";

export const releaseTestInputExample = {
  preflightId: "pfl_01J8Z3K6W2Q9V4N7T5R8M3X1CY",
  profile: "quick",
  expected: { status: 200, contentType: "application/json" },
} satisfies ReleaseTestBody;

export const releaseTestInputSchema = {
  type: "object",
  properties: {
    preflightId: { type: "string", description: "Id returned by POST /v1/preflight" },
    profile: { type: "string", enum: ["quick"] },
    expected: {
      type: "object",
      properties: {
        status: { type: "integer", minimum: 100, maximum: 599 },
        contentType: { type: "string" },
        jsonSchema: { type: "object" },
      },
      additionalProperties: false,
    },
  },
  required: ["preflightId", "profile"],
  additionalProperties: false,
};

export const releaseTestOutputExample = {
  jobId: "job_EXAMPLE_JOB_ID",
  verdict: "PASS",
  target: "https://api.example.com/v1/quote",
  checks: [
    {
      id: "handshake",
      status: "PASS",
      code: "HANDSHAKE_VALID",
      blocking: true,
      summary: "Example: the unpaid request returned a valid x402 v2 challenge.",
      evidence: ["evd_EXAMPLE_HANDSHAKE"],
    },
    {
      id: "paid_delivery",
      status: "PASS",
      code: "PAID_AND_DELIVERED",
      blocking: true,
      summary: "Example: the downstream payment settled and the target returned 200.",
      evidence: ["evd_EXAMPLE_PAID_RESPONSE", "evd_EXAMPLE_DOWNSTREAM_PAYMENT"],
    },
    {
      id: "response_contract",
      status: "PASS",
      code: "CONTRACT_MATCHED",
      blocking: true,
      summary: "Example: the paid response matched status 200 and content type application/json.",
      evidence: ["evd_EXAMPLE_PAID_RESPONSE"],
    },
    {
      id: "discovery_contract",
      status: "PASS",
      code: "DISCOVERY_CONSISTENT",
      blocking: true,
      summary: "Example: the live challenge and the catalog record agree.",
      evidence: ["evd_EXAMPLE_DISCOVERY"],
    },
    {
      id: "retry_safety",
      status: "PASS",
      code: "PASS_REPLAY_REJECTED",
      blocking: true,
      summary: "Example: replaying the identical signed payment was rejected with status 402.",
      evidence: ["evd_EXAMPLE_REPLAY"],
    },
  ],
  warnings: [],
  inconclusiveReason: null,
  money: {
    seloInboundTxId: "EXAMPLE_INBOUND_TXID",
    downstreamSpendUsdc: "0.01",
    downstreamTxIds: ["EXAMPLE_DOWNSTREAM_TXID"],
  },
  reportUrl: "https://selo.example/v1/reports/EXAMPLE_REPORT_TOKEN",
} satisfies ReleaseTestResponse;

export const seloLogoUrl = "https://useselo.xyz/brand/selo-logo-512.png";

export const seloMerchantExtension = {
  "x402-merchant": {
    info: {
      name: "Selo",
      website: "https://useselo.xyz",
      logo: seloLogoUrl,
      categories: ["x402", "algorand", "developer-tools", "testing", "x402-global-challenge"],
    },
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        website: { type: "string" },
        logo: { type: "string" },
        categories: { type: "array", items: { type: "string" } },
      },
    },
  },
};
