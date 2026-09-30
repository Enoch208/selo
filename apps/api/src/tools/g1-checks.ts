import { formatMicros, parseAtomicUnits, parseChallenge, type X402Challenge } from "@selo/core";
import { z } from "zod";
import { seloNetworks } from "../payments/networks";
import { challengeTag } from "../release/discovery";
import type { LeaderboardRow, MerchantRecord, ResourceRecord } from "./facilitator-schemas";
import type { Fetched } from "./fetched";

export interface G1Check {
  readonly id: string;
  readonly label: string;
  readonly pass: boolean;
  readonly detail: string;
}

export interface ProbeRead {
  readonly status: number;
  readonly decoded: unknown;
  readonly decodeError: string | null;
}

export const leaderboardSources = ["x402-global-challenge", "bazaar", "direct", "dev"] as const;
export type LeaderboardSource = (typeof leaderboardSources)[number];
export type RowsBySource = Readonly<Record<LeaderboardSource, readonly LeaderboardRow[]>>;

const challengeLabels = {
  A01: "unpaid request returns 402",
  A02: "402 asks for Mainnet USDC to payTo",
  A03: "402 carries the challenge tag",
  A04: "402 carries Bazaar discovery metadata",
} as const;

type ChallengeCheckId = keyof typeof challengeLabels;

const mainnet = seloNetworks["algorand-mainnet"];

const bazaarSchema = z.looseObject({
  info: z.looseObject({
    input: z.looseObject({ type: z.literal("http"), method: z.literal("POST") }),
    output: z.looseObject({ type: z.string() }),
  }),
  schema: z.record(z.string(), z.unknown()),
});

const check = (id: string, label: string, pass: boolean, detail: string): G1Check => ({
  id,
  label,
  pass,
  detail,
});

const challengeCheck = (id: ChallengeCheckId, pass: boolean, detail: string): G1Check =>
  check(id, challengeLabels[id], pass, detail);

function failAll(detail: string): G1Check[] {
  const ids: readonly ChallengeCheckId[] = ["A01", "A02", "A03", "A04"];
  return ids.map((id) => challengeCheck(id, false, detail));
}

function payToCheck(challenge: X402Challenge, payTo: string): G1Check {
  const accept = challenge.accepts.find(
    (entry) =>
      entry.scheme === "exact" &&
      entry.network === mainnet.caip2 &&
      entry.asset === mainnet.usdcAssetId &&
      entry.payTo === payTo,
  );
  if (accept === undefined) {
    const offered = challenge.accepts.map((e) => `${e.network} asset ${e.asset} to ${e.payTo}`);
    return challengeCheck(
      "A02",
      false,
      `no exact Mainnet USDC accept to ${payTo}; offered: ${offered.join("; ") || "none"}`,
    );
  }
  const price = formatMicros(parseAtomicUnits(accept.amount) ?? 0);
  return challengeCheck(
    "A02",
    true,
    `${price} USDC, asset ${accept.asset}, ${accept.network}, payTo ${payTo}`,
  );
}

function tagCheck(challenge: X402Challenge): G1Check {
  const acceptsTagged =
    challenge.accepts.length > 0 &&
    challenge.accepts.every((entry) => entry.extra?.tag === challengeTag);
  const resourceTagged = challenge.resource?.tags?.includes(challengeTag) === true;
  const missing = [
    ...(acceptsTagged ? [] : ["accepts[].extra.tag"]),
    ...(resourceTagged ? [] : ["resource.tags"]),
  ];
  return missing.length === 0
    ? challengeCheck("A03", true, `accepts[].extra.tag and resource.tags carry ${challengeTag}`)
    : challengeCheck("A03", false, `${challengeTag} missing from ${missing.join(" and ")}`);
}

function discoveryCheck(challenge: X402Challenge): G1Check {
  const bazaar = bazaarSchema.safeParse(challenge.extensions?.bazaar);
  return bazaar.success
    ? challengeCheck("A04", true, "extensions.bazaar declares POST input, output and schema")
    : challengeCheck(
        "A04",
        false,
        `extensions.bazaar missing or incomplete: ${bazaar.error.issues.map((i) => i.path.join(".")).join(", ")}`,
      );
}

export function checkChallenge(probe: Fetched<ProbeRead>, payTo: string): G1Check[] {
  if (!probe.ok) {
    return failAll(`unpaid probe failed: ${probe.reason}`);
  }
  const { status, decoded, decodeError } = probe.value;
  if (status !== 402) {
    return failAll(`expected HTTP 402, got ${String(status)}`);
  }
  if (decodeError !== null) {
    return failAll(`PAYMENT-REQUIRED header undecodable: ${decodeError}`);
  }
  const parsed = parseChallenge(decoded);
  if (!parsed.ok) {
    return failAll(`PAYMENT-REQUIRED header missing or malformed: ${parsed.issue}`);
  }
  return [
    challengeCheck("A01", true, "HTTP 402 with a decodable PAYMENT-REQUIRED header"),
    payToCheck(parsed.challenge, payTo),
    tagCheck(parsed.challenge),
    discoveryCheck(parsed.challenge),
  ];
}

export function checkBazaar(found: Fetched<readonly ResourceRecord[]>): G1Check {
  const label = "Selo is listed in the Bazaar catalog";
  if (!found.ok) {
    return check("A07", label, false, `catalog unreachable: ${found.reason}`);
  }
  const urls = found.value.map((record) => `${record.method} ${record.resourceUrl}`);
  return urls.length > 0
    ? check("A07", label, true, urls.join("; "))
    : check("A07", label, false, "no Bazaar resource for this domain");
}

export function checkMerchant(found: Fetched<readonly MerchantRecord[]>): G1Check {
  const label = "payTo is a known merchant";
  if (!found.ok) {
    return check("MERCHANT", label, false, `merchant list unreachable: ${found.reason}`);
  }
  const [merchant] = found.value;
  return merchant === undefined
    ? check("MERCHANT", label, false, "no merchant with addresses.avm equal to payTo")
    : check(
        "MERCHANT",
        label,
        true,
        `merchant ${merchant.id}, ${String(merchant.totalSettlements ?? 0)} settlements`,
      );
}

const describeRow = (row: LeaderboardRow): string =>
  `rank ${String(row.rank)}, ${String(row.settles)} settles, volume ${String(row.volume)}`;

export function checkLeaderboard(found: Fetched<RowsBySource>): G1Check {
  const label = "payTo has a row under src=x402-global-challenge";
  if (!found.ok) {
    return check("A08", label, false, `leaderboard unreachable: ${found.reason}`);
  }
  const [challengeRow] = found.value["x402-global-challenge"];
  if (challengeRow?.blocked !== undefined) {
    return check(
      "A08",
      label,
      false,
      `challenge row is blocked: ${challengeRow.blocked.reason ?? "no reason given"}`,
    );
  }
  if (challengeRow !== undefined) {
    return check("A08", label, true, describeRow(challengeRow));
  }
  const elsewhere = leaderboardSources.filter((src) => found.value[src].length > 0);
  if (elsewhere.length === 0) {
    return check("A08", label, false, "no leaderboard row for payTo under any source");
  }
  const onlyUntagged = elsewhere.every((src) => src === "direct" || src === "dev");
  const detail = onlyUntagged
    ? `volume only under direct/dev (${elsewhere.join(", ")}); not challenge-attributed`
    : `payTo appears only under ${elsewhere.join(", ")}; no x402-global-challenge row`;
  return check("A08", label, false, detail);
}
