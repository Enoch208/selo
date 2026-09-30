import Ajv from "ajv";
import type { ValidateFunction } from "ajv";
import type { CheckResult, CheckStatus, ExpectedContract } from "../contract";

const maxSchemaBytes = 16 * 1024;
const mediaTypePattern = /^[a-z0-9][a-z0-9!#$&\-^_.+]*\/[a-z0-9][a-z0-9!#$&\-^_.+]*$/;
const summaryTruncateAt = 200;

function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const char of text) {
    const codePoint = char.codePointAt(0) ?? 0;
    if (codePoint <= 0x7f) {
      bytes += 1;
    } else if (codePoint <= 0x7ff) {
      bytes += 2;
    } else if (codePoint <= 0xffff) {
      bytes += 3;
    } else {
      bytes += 4;
    }
  }
  return bytes;
}

export interface CompiledContract {
  readonly status: number;
  readonly contentType: string | null;
  readonly validate: ValidateFunction | null;
}

export type CompileContractResult =
  | { readonly ok: true; readonly contract: CompiledContract }
  | { readonly ok: false; readonly issue: string };

export function compileContract(expected: ExpectedContract): CompileContractResult {
  const status = expected.status ?? 200;
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    return {
      ok: false,
      issue: `status must be an integer between 100 and 599, received ${String(status)}`,
    };
  }
  if (
    expected.contentType !== undefined &&
    !mediaTypePattern.test(expected.contentType.toLowerCase())
  ) {
    return {
      ok: false,
      issue: `contentType must be a "type/subtype" media type, received "${expected.contentType}"`,
    };
  }
  let validate: ValidateFunction | null = null;
  if (expected.jsonSchema !== undefined) {
    const serializedBytes = utf8ByteLength(JSON.stringify(expected.jsonSchema));
    if (serializedBytes > maxSchemaBytes) {
      return {
        ok: false,
        issue: `jsonSchema must serialize to at most ${String(maxSchemaBytes)} bytes, received ${String(serializedBytes)}`,
      };
    }
    const ajv = new Ajv({ strict: true, allErrors: false });
    try {
      validate = ajv.compile(expected.jsonSchema);
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown schema compilation error";
      return { ok: false, issue: `jsonSchema failed to compile: ${message}` };
    }
  }
  return {
    ok: true,
    contract: { status, contentType: expected.contentType ?? null, validate },
  };
}

export interface ObservedResponse {
  readonly status: number;
  readonly contentType: string | null;
  readonly bodyText: string | null;
}

export interface EvaluateResponseContractInput {
  readonly contract: CompiledContract;
  readonly observed: ObservedResponse | null;
  readonly evidence: readonly string[];
}

function mediaType(contentType: string | null): string | null {
  if (contentType === null) {
    return null;
  }
  const [type] = contentType.split(";");
  return (type ?? "").trim().toLowerCase();
}

function truncate(text: string): string {
  return text.length > summaryTruncateAt ? `${text.slice(0, summaryTruncateAt)}...` : text;
}

function build(
  evidence: readonly string[],
  status: CheckStatus,
  code: string,
  summary: string,
): CheckResult {
  return { id: "response_contract", status, code, blocking: true, summary, evidence };
}

export function evaluateResponseContract(input: EvaluateResponseContractInput): CheckResult {
  const { contract, observed, evidence } = input;
  if (observed === null) {
    return build(evidence, "INCONCLUSIVE", "NOT_RUN", "The response contract check did not run.");
  }
  if (observed.status !== contract.status) {
    return build(
      evidence,
      "FAIL",
      "STATUS_MISMATCH",
      `Expected status ${String(contract.status)} but observed ${String(observed.status)}.`,
    );
  }
  if (
    contract.contentType !== null &&
    mediaType(observed.contentType) !== mediaType(contract.contentType)
  ) {
    return build(
      evidence,
      "FAIL",
      "CONTENT_TYPE_MISMATCH",
      `Expected content type ${contract.contentType} but observed ${observed.contentType ?? "none"}.`,
    );
  }
  if (contract.validate !== null) {
    if (observed.bodyText === null) {
      return build(
        evidence,
        "FAIL",
        "BODY_NOT_JSON",
        "A JSON schema was expected but the response body was empty.",
      );
    }
    let body: unknown;
    try {
      body = JSON.parse(observed.bodyText) as unknown;
    } catch {
      return build(
        evidence,
        "FAIL",
        "BODY_NOT_JSON",
        "A JSON schema was expected but the response body was not valid JSON.",
      );
    }
    if (!contract.validate(body)) {
      const firstError = contract.validate.errors?.[0];
      const detail =
        firstError !== undefined
          ? `${firstError.instancePath} ${firstError.message ?? ""}`.trim()
          : "schema validation failed";
      return build(
        evidence,
        "FAIL",
        "SCHEMA_MISMATCH",
        truncate(`Response body did not match the expected schema: ${detail}`),
      );
    }
  }
  return build(
    evidence,
    "PASS",
    "CONTRACT_MATCHED",
    `Observed response matched the expected status ${String(contract.status)}${
      contract.contentType !== null ? ` and content type ${contract.contentType}` : ""
    }.`,
  );
}
