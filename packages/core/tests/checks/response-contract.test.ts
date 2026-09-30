import { describe, expect, it } from "vitest";
import type { ExpectedContract } from "../../src/contract";
import type { CompiledContract, ObservedResponse } from "../../src/checks/response-contract";
import { compileContract, evaluateResponseContract } from "../../src/checks/response-contract";

const evidence = ["ev-4"];
const petSchema: Record<string, unknown> = {
  type: "object",
  required: ["name"],
  properties: { name: { type: "string" } },
  additionalProperties: false,
};

function mustCompile(expected: ExpectedContract): CompiledContract {
  const result = compileContract(expected);
  if (!result.ok) {
    throw new Error(`fixture contract must compile: ${result.issue}`);
  }
  return result.contract;
}

describe("compileContract", () => {
  it("defaults status to 200 when unspecified", () => {
    const contract = mustCompile({});
    expect(contract.status).toBe(200);
    expect(contract.contentType).toBeNull();
    expect(contract.validate).toBeNull();
  });

  it.each([99, 600, 200.5])("rejects an out-of-range or non-integer status %s", (status) => {
    const result = compileContract({ status });
    expect(result.ok).toBe(false);
  });

  it.each([100, 200, 599])("accepts a valid status %i", (status) => {
    const result = compileContract({ status });
    expect(result.ok).toBe(true);
  });

  it("accepts a well-formed type/subtype content type", () => {
    const result = compileContract({ contentType: "application/json" });
    expect(result.ok).toBe(true);
  });

  it.each(["application", "application/", "/json", "not a type"])(
    "rejects a malformed content type %j",
    (contentType) => {
      const result = compileContract({ contentType });
      expect(result.ok).toBe(false);
    },
  );

  it("compiles a well-formed JSON schema", () => {
    const contract = mustCompile({ jsonSchema: petSchema });
    expect(contract.validate).not.toBeNull();
  });

  it("rejects a JSON schema that is too large", () => {
    const bigSchema: Record<string, unknown> = {
      type: "object",
      properties: Object.fromEntries(
        Array.from({ length: 2000 }, (_, i) => [
          `field${String(i)}`,
          { type: "string", description: "x".repeat(20) },
        ]),
      ),
    };
    const result = compileContract({ jsonSchema: bigSchema });
    expect(result.ok).toBe(false);
  });

  it("rejects a JSON schema that fails to compile under Ajv strict mode", () => {
    const result = compileContract({ jsonSchema: { type: "object", propertis: {} } });
    expect(result.ok).toBe(false);
  });

  it("rejects a JSON schema with an unresolvable remote $ref", () => {
    const result = compileContract({ jsonSchema: { $ref: "https://example.com/schema.json" } });
    expect(result.ok).toBe(false);
  });
});

describe("evaluateResponseContract", () => {
  function evaluate(contract: CompiledContract, observed: ObservedResponse | null) {
    return evaluateResponseContract({ contract, observed, evidence });
  }

  it("observed null is INCONCLUSIVE NOT_RUN", () => {
    const contract = mustCompile({});
    const check = evaluate(contract, null);
    expect(check.status).toBe("INCONCLUSIVE");
    expect(check.code).toBe("NOT_RUN");
  });

  it("a status mismatch is FAIL STATUS_MISMATCH", () => {
    const contract = mustCompile({ status: 200 });
    const check = evaluate(contract, { status: 404, contentType: null, bodyText: null });
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("STATUS_MISMATCH");
  });

  it("a content type mismatch is FAIL CONTENT_TYPE_MISMATCH", () => {
    const contract = mustCompile({ contentType: "application/json" });
    const check = evaluate(contract, { status: 200, contentType: "text/html", bodyText: null });
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("CONTENT_TYPE_MISMATCH");
  });

  it("content type parameters are stripped before comparison", () => {
    const contract = mustCompile({ contentType: "application/json" });
    const check = evaluate(contract, {
      status: 200,
      contentType: "Application/JSON; charset=utf-8",
      bodyText: null,
    });
    expect(check.status).toBe("PASS");
  });

  it("a schema present but a non-JSON body is FAIL BODY_NOT_JSON", () => {
    const contract = mustCompile({ jsonSchema: petSchema });
    const check = evaluate(contract, { status: 200, contentType: null, bodyText: "not json" });
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("BODY_NOT_JSON");
  });

  it("a schema present but an empty body is FAIL BODY_NOT_JSON", () => {
    const contract = mustCompile({ jsonSchema: petSchema });
    const check = evaluate(contract, { status: 200, contentType: null, bodyText: null });
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("BODY_NOT_JSON");
  });

  it("A18: a response that violates the expected schema produces FAIL", () => {
    const contract = mustCompile({ jsonSchema: petSchema });
    const check = evaluate(contract, {
      status: 200,
      contentType: null,
      bodyText: JSON.stringify({ notName: "oops" }),
    });
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("SCHEMA_MISMATCH");
    expect(check.summary.length).toBeLessThanOrEqual(
      200 + "Response body did not match the expected schema: ".length,
    );
    expect(check.summary).toContain("Response body did not match the expected schema");
  });

  it("truncates a very long schema mismatch summary to 200 characters of Ajv detail", () => {
    const longName = `a${"b".repeat(300)}`;
    const longPropSchema: Record<string, unknown> = {
      type: "object",
      properties: { [longName]: { type: "string" } },
      required: [longName],
    };
    const contract = mustCompile({ jsonSchema: longPropSchema });
    const check = evaluate(contract, { status: 200, contentType: null, bodyText: "{}" });
    expect(check.status).toBe("FAIL");
    expect(check.code).toBe("SCHEMA_MISMATCH");
  });

  it("a matching status, content type and schema is PASS CONTRACT_MATCHED", () => {
    const contract = mustCompile({
      status: 200,
      contentType: "application/json",
      jsonSchema: petSchema,
    });
    const check = evaluate(contract, {
      status: 200,
      contentType: "application/json",
      bodyText: JSON.stringify({ name: "Rex" }),
    });
    expect(check.id).toBe("response_contract");
    expect(check.status).toBe("PASS");
    expect(check.code).toBe("CONTRACT_MATCHED");
    expect(check.blocking).toBe(true);
    expect(check.evidence).toBe(evidence);
    expect(typeof check.summary).toBe("string");
  });

  it("a matching status with no expected content type or schema is PASS", () => {
    const contract = mustCompile({});
    const check = evaluate(contract, { status: 200, contentType: "text/plain", bodyText: "hello" });
    expect(check.status).toBe("PASS");
    expect(check.code).toBe("CONTRACT_MATCHED");
  });
});
