import type { CheckResult, CheckStatus } from "../contract";
import type { AlgorandRequirement, DiscoveryPolicy } from "./challenge";
import { parseChallenge, selectRequirement } from "./challenge";

export interface EvaluateHandshakeInput {
  readonly status: number;
  readonly decoded: unknown;
  readonly decodeFailed: boolean;
  readonly policy: DiscoveryPolicy;
  readonly isValidPayTo: (address: string) => boolean;
  readonly evidence: readonly string[];
}

export interface HandshakeResult {
  readonly check: CheckResult;
  readonly requirement: AlgorandRequirement | null;
}

function outcome(
  evidence: readonly string[],
  status: CheckStatus,
  code: string,
  summary: string,
  requirement: AlgorandRequirement | null = null,
): HandshakeResult {
  return {
    check: { id: "handshake", status, code, blocking: true, summary, evidence },
    requirement,
  };
}

export function evaluateHandshake(input: EvaluateHandshakeInput): HandshakeResult {
  const { status, decoded, decodeFailed, policy, isValidPayTo, evidence } = input;

  if (status >= 500) {
    return outcome(
      evidence,
      "INCONCLUSIVE",
      "TARGET_UNAVAILABLE",
      `Target responded with status ${String(status)}, a server error, before a payment challenge could be evaluated.`,
    );
  }
  if (status !== 402) {
    return outcome(
      evidence,
      "FAIL",
      "NOT_PAYMENT_REQUIRED",
      `Target responded with status ${String(status)} instead of the expected 402 Payment Required.`,
    );
  }
  if (decoded === null && !decodeFailed) {
    return outcome(
      evidence,
      "FAIL",
      "CHALLENGE_MISSING",
      "Target returned 402 but carried no PAYMENT-REQUIRED challenge payload.",
    );
  }
  if (decodeFailed) {
    return outcome(
      evidence,
      "FAIL",
      "CHALLENGE_MALFORMED",
      "The PAYMENT-REQUIRED header could not be decoded into a challenge payload.",
    );
  }
  const parsed = parseChallenge(decoded);
  if (!parsed.ok) {
    return outcome(
      evidence,
      "FAIL",
      "CHALLENGE_MALFORMED",
      `The decoded challenge payload failed schema validation: ${parsed.issue}`,
    );
  }
  const { challenge } = parsed;
  if (challenge.x402Version !== 2) {
    return outcome(
      evidence,
      "INCONCLUSIVE",
      "UNSUPPORTED_X402_VERSION",
      `Challenge declared x402 version ${String(challenge.x402Version)}, which Selo does not support.`,
    );
  }
  const requirement = selectRequirement(challenge, policy);
  if (requirement === null) {
    return outcome(
      evidence,
      "FAIL",
      "NO_SUPPORTED_REQUIREMENT",
      `Challenge offered no "exact" scheme requirement for network ${policy.network} and asset ${policy.asset}.`,
    );
  }
  if (requirement.amountMicros === 0) {
    return outcome(
      evidence,
      "FAIL",
      "PRICE_UNPARSEABLE",
      "The matching payment requirement's amount could not be parsed as a positive integer of atomic units.",
      requirement,
    );
  }
  if (!isValidPayTo(requirement.payTo)) {
    return outcome(
      evidence,
      "FAIL",
      "PAY_TO_INVALID",
      `The matching payment requirement's payTo address "${requirement.payTo}" is not a valid address.`,
      requirement,
    );
  }
  return outcome(
    evidence,
    "PASS",
    "HANDSHAKE_VALID",
    `Target issued a valid x402 v2 challenge with a supported requirement for network ${policy.network} and asset ${policy.asset}.`,
    requirement,
  );
}
