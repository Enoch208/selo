import { describe, expect, it } from "vitest";
import type { AlgorandRequirement } from "../../src/checks/challenge";
import type { CatalogLookup, EvaluateDiscoveryInput } from "../../src/checks/discovery";
import { evaluateDiscovery } from "../../src/checks/discovery";
import {
  catalogRecord,
  liveAcceptEntry,
  liveChallenge,
  mainnetNetwork,
  mainnetUsdcAsset,
  merchantPayTo,
} from "./fixtures";

const evidence = ["ev-5"];

const requirement: AlgorandRequirement = {
  scheme: "exact",
  network: mainnetNetwork,
  asset: mainnetUsdcAsset,
  amountMicros: 10_000,
  payTo: merchantPayTo,
  maxTimeoutSeconds: 300,
  extra: liveAcceptEntry.extra,
};

const target = { url: catalogRecord.resourceUrl, method: "GET" as const };
const liveInfo = liveChallenge.extensions.bazaar.info;
const liveResource = {
  description: liveChallenge.resource.description,
  mimeType: liveChallenge.resource.mimeType,
};

function baseInput(overrides: Partial<EvaluateDiscoveryInput> = {}): EvaluateDiscoveryInput {
  return {
    target,
    requirement,
    liveInfo,
    liveResource,
    catalog: { kind: "found", record: catalogRecord },
    evidence,
    ...overrides,
  };
}

describe("evaluateDiscovery", () => {
  it("a live method declaration that disagrees with the target method is FAIL LIVE_METHOD_MISMATCH", () => {
    const check = evaluateDiscovery(baseInput({ target: { url: target.url, method: "POST" } }));
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("LIVE_METHOD_MISMATCH");
  });

  it("a catalog record that fails schema validation is FAIL CATALOG_RECORD_MALFORMED", () => {
    const check = evaluateDiscovery(
      baseInput({ catalog: { kind: "found", record: { not: "a record" } } }),
    );
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("CATALOG_RECORD_MALFORMED");
  });

  it("a catalog record method that disagrees with the target is FAIL CATALOG_METHOD_MISMATCH", () => {
    const check = evaluateDiscovery(
      baseInput({ catalog: { kind: "found", record: { ...catalogRecord, method: "POST" } } }),
    );
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("CATALOG_METHOD_MISMATCH");
  });

  it("a catalog resourceUrl that disagrees with the target is FAIL CATALOG_URL_MISMATCH", () => {
    const check = evaluateDiscovery(
      baseInput({
        catalog: {
          kind: "found",
          record: { ...catalogRecord, resourceUrl: "https://other.example/v1/x" },
        },
      }),
    );
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("CATALOG_URL_MISMATCH");
  });

  it("no accepts entry matching network+asset+payTo is FAIL CATALOG_PAYMENT_MISMATCH", () => {
    const check = evaluateDiscovery(
      baseInput({
        catalog: {
          kind: "found",
          record: {
            ...catalogRecord,
            accepts: [{ ...liveAcceptEntry, payTo: "SOMEOTHERADDRESS" }],
          },
        },
      }),
    );
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("CATALOG_PAYMENT_MISMATCH");
  });

  it("a matching entry with a different price is FAIL CATALOG_PRICE_MISMATCH naming both prices", () => {
    const check = evaluateDiscovery(
      baseInput({
        catalog: {
          kind: "found",
          record: { ...catalogRecord, accepts: [{ ...liveAcceptEntry, amount: "99999" }] },
        },
      }),
    );
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("CATALOG_PRICE_MISMATCH");
    expect(check.summary).toMatch(/0\.099999|99999/);
    expect(check.summary).toMatch(/0\.01|10000/);
  });

  it("catalog unavailable is INCONCLUSIVE CATALOG_UNAVAILABLE", () => {
    const catalog: CatalogLookup = { kind: "unavailable" };
    const check = evaluateDiscovery(baseInput({ catalog }));
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.code).toBe("CATALOG_UNAVAILABLE");
  });

  it("catalog not_found is WARN NOT_CATALOGED", () => {
    const catalog: CatalogLookup = { kind: "not_found" };
    const check = evaluateDiscovery(baseInput({ catalog }));
    expect(check.status).toBe("WARN");
    expect(check.code).toBe("NOT_CATALOGED");
  });

  it("no description anywhere is WARN SPARSE_METADATA", () => {
    const check = evaluateDiscovery(
      baseInput({
        liveResource: null,
        catalog: { kind: "found", record: { ...catalogRecord, description: undefined } },
      }),
    );
    expect(check.status).toBe("WARN");
    expect(check.code).toBe("SPARSE_METADATA");
  });

  it("no discovery info declared anywhere is WARN SPARSE_METADATA", () => {
    const check = evaluateDiscovery(
      baseInput({
        liveInfo: undefined,
        catalog: { kind: "found", record: { ...catalogRecord, discoveryInfo: undefined } },
      }),
    );
    expect(check.status).toBe("WARN");
    expect(check.code).toBe("SPARSE_METADATA");
  });

  it("no output example anywhere is WARN SPARSE_METADATA", () => {
    const check = evaluateDiscovery(
      baseInput({
        liveInfo: { input: { type: "http", method: "GET" } },
        catalog: {
          kind: "found",
          record: { ...catalogRecord, discoveryInfo: { input: { type: "http", method: "GET" } } },
        },
      }),
    );
    expect(check.status).toBe("WARN");
    expect(check.code).toBe("SPARSE_METADATA");
  });

  it("consistent live and catalog data with metadata is PASS DISCOVERY_CONSISTENT", () => {
    const check = evaluateDiscovery(baseInput());
    expect(check.id).toBe("discovery_contract");
    expect(check.status).toBe("PASS");
    expect(check.code).toBe("DISCOVERY_CONSISTENT");
    expect(check.blocking).toBe(true);
    expect(check.evidence).toBe(evidence);
    expect(typeof check.summary).toBe("string");
  });
});
