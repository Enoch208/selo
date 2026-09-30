import {
  evaluateHandshake,
  parseChallenge,
  type AlgorandRequirement,
  type DiscoveryPolicy,
  type PreflightRejection,
} from "@selo/core";
import algosdk from "algosdk";
import { canonicalJson, sha256Hex } from "../evidence/canonical";
import type { ChallengeRead } from "../payments/challenge-io";

export interface RecordedJson {
  readonly json: unknown;
  readonly hash: string;
}

export type Assessment =
  | {
      readonly eligible: true;
      readonly requirement: AlgorandRequirement;
      readonly challenge: RecordedJson | null;
    }
  | {
      readonly eligible: false;
      readonly reason: PreflightRejection;
      readonly requirement: AlgorandRequirement | null;
      readonly challenge: RecordedJson | null;
    };

const challengeKeys = ["x402Version", "resource", "accepts", "extensions", "error"] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export function recorded(json: unknown): RecordedJson {
  return { json, hash: sha256Hex(canonicalJson(json)) };
}

function recordedChallenge(decoded: unknown): RecordedJson | null {
  if (!isRecord(decoded)) {
    return null;
  }
  const kept = challengeKeys.filter((key) => key in decoded).map((key) => [key, decoded[key]]);
  return recorded(Object.fromEntries(kept));
}

function offersNetwork(decoded: unknown, network: string): boolean {
  const parsed = parseChallenge(decoded);
  return (
    parsed.ok &&
    parsed.challenge.accepts.some((entry) => entry.scheme === "exact" && entry.network === network)
  );
}

function rejectionFor(code: string, decoded: unknown, policy: DiscoveryPolicy): PreflightRejection {
  if (code === "TARGET_UNAVAILABLE") {
    return "TARGET_UNREACHABLE";
  }
  if (code === "NO_SUPPORTED_REQUIREMENT") {
    return offersNetwork(decoded, policy.network) ? "ASSET_NOT_SUPPORTED" : "NETWORK_NOT_SUPPORTED";
  }
  return "NO_PAYMENT_CHALLENGE";
}

export function assessChallenge(
  read: ChallengeRead,
  policy: DiscoveryPolicy,
  jobMaxSpendMicros: number,
): Assessment {
  const handshake = evaluateHandshake({
    status: read.status,
    decoded: read.decoded,
    decodeFailed: read.decodeFailed,
    policy,
    isValidPayTo: (address) => algosdk.isValidAddress(address),
    evidence: [],
  });
  const challenge = recordedChallenge(read.decoded);
  const { requirement } = handshake;
  if (handshake.check.code !== "HANDSHAKE_VALID" || requirement === null) {
    const reason = rejectionFor(handshake.check.code, read.decoded, policy);
    return { eligible: false, reason, requirement, challenge };
  }
  if (requirement.amountMicros > jobMaxSpendMicros) {
    return { eligible: false, reason: "PRICE_OVER_BUDGET", requirement, challenge };
  }
  return { eligible: true, requirement, challenge };
}
