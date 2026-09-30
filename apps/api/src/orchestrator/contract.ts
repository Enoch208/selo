import {
  compileContract,
  evaluateResponseContract,
  type CheckResult,
  type ExpectedContract,
  type InconclusiveReason,
} from "@selo/core";
import { sha256Hex } from "../ids";
import type { JobContext } from "./context";
import { evidenceFor } from "./evidence";
import type { DeliveredOutcome, Delivery } from "./paid-outcome";
import { skipScenario } from "./skip";
import { StoredContractInvalid, storedContract } from "../reports/expected";

function unreadable(
  response: DeliveredOutcome,
): { code: string; reason: InconclusiveReason } | null {
  if (response.bodyReadFailure === "timeout") {
    return { code: "BODY_READ_TIMEOUT", reason: "TARGET_TIMEOUT" };
  }
  if (response.bodyReadFailure === "network") {
    return { code: "BODY_READ_FAILED", reason: "NETWORK_UNAVAILABLE" };
  }
  return response.bodyTooLarge ? { code: "BODY_TOO_LARGE", reason: "EVIDENCE_INCOMPLETE" } : null;
}

function evaluate(
  ctx: JobContext,
  response: DeliveredOutcome,
  expected: ExpectedContract,
): CheckResult {
  const blocked = unreadable(response);
  if (blocked !== null) {
    ctx.state.inconclusive(blocked.reason);
    return {
      id: "response_contract",
      status: "INCONCLUSIVE",
      code: blocked.code,
      blocking: true,
      summary:
        "The paid response body could not be read in full, so the contract was not evaluated.",
      evidence: [],
    };
  }
  const compiled = compileContract(expected);
  if (!compiled.ok) {
    throw new StoredContractInvalid(`stored expected contract does not compile: ${compiled.issue}`);
  }
  return evaluateResponseContract({
    contract: compiled.contract,
    observed: {
      status: response.status,
      contentType: response.contentType,
      bodyText: response.bodyText,
    },
    evidence: [],
  });
}

export async function runResponseContract(ctx: JobContext, delivery: Delivery): Promise<void> {
  const scenario = ctx.scenarios.response_contract;
  if (delivery.kind !== "response") {
    await skipScenario(ctx, scenario, null);
    return;
  }
  const { response } = delivery;
  const expected = storedContract(ctx.job.expectedJson);
  const result = evaluate(ctx, response, expected);
  const body = response.bodyText;
  const evidenceId = await evidenceFor(ctx, scenario, "response_contract", {
    expected,
    observed: {
      status: response.status,
      contentType: response.contentType,
      bodySha256: body === null ? null : sha256Hex(body),
      bodyBytes: body === null ? null : Buffer.byteLength(body),
    },
    code: result.code,
    status: result.status,
  });
  const check = ctx.state.record({ ...result, evidence: [delivery.paidEvidenceId, evidenceId] });
  await scenario.evaluate(check, { code: check.code });
}
