import { classifyHostname } from "@selo/core";
import algosdk from "algosdk";
import { fail, fromInvocationDir, parseCli, say } from "./cli";
import { writeEvidence } from "./evidence-file";
import { fetchChallengeRows, fetchDomainResources, fetchMerchantsFor } from "./facilitator-client";
import type { Fetched } from "./fetched";
import {
  checkBazaar,
  checkChallenge,
  checkLeaderboard,
  checkMerchant,
  type G1Check,
} from "./g1-checks";
import { probeRelease, releaseTestUrl } from "./g1-probe";

const facilitator = "https://facilitator.goplausible.xyz";
const hostPattern = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const usage =
  "Usage: verify:g1 -- --domain <public host> --pay-to <Algorand address> --preflight <preflight id> [--out <dir>]";

const values = parseCli({
  domain: { type: "string" },
  "pay-to": { type: "string" },
  preflight: { type: "string" },
  out: { type: "string" },
});

const outcomeOf = <T>(found: Fetched<T>) =>
  found.ok ? { ok: true, result: found.value } : { ok: false, reason: found.reason };

function report(checks: readonly G1Check[]): boolean {
  for (const check of checks) {
    say(`${check.pass ? "PASS" : "FAIL"} ${check.id} ${check.label}: ${check.detail}`);
  }
  const passed = checks.every((check) => check.pass);
  say(passed ? "G1: all checks pass" : "G1: not proven");
  return passed;
}

async function verify(domain: string, payTo: string, preflightId: string, out: string | undefined) {
  const probe = await probeRelease(fetch, domain, preflightId);
  const resources = await fetchDomainResources(fetch, facilitator, domain);
  const merchants = await fetchMerchantsFor(fetch, facilitator, payTo);
  const rows = await fetchChallengeRows(fetch, facilitator, payTo);
  const challengeChecks = checkChallenge(probe, payTo);
  const checks = [
    ...challengeChecks,
    checkBazaar(resources),
    checkMerchant(merchants),
    checkLeaderboard(rows),
  ];
  const passed = report(checks);
  if (out !== undefined) {
    const dir = fromInvocationDir(out);
    const now = new Date();
    const context = { domain, payTo, facilitator };
    const saved = [
      await writeEvidence(
        dir,
        "g1-402-response.json",
        { url: releaseTestUrl(domain), ...outcomeOf(probe), checks: challengeChecks },
        now,
      ),
      await writeEvidence(
        dir,
        "g1-bazaar-resource.json",
        { ...context, ...outcomeOf(resources) },
        now,
      ),
      await writeEvidence(dir, "g1-merchant.json", { ...context, ...outcomeOf(merchants) }, now),
      await writeEvidence(
        dir,
        "g1-leaderboard.json",
        {
          ...context,
          ...(rows.ok ? { ok: true, bySource: rows.value } : { ok: false, reason: rows.reason }),
        },
        now,
      ),
    ];
    for (const path of saved) {
      say(`saved ${path}`);
    }
  }
  process.exitCode = passed ? 0 : 1;
}

if (values === null) {
  fail("Unrecognised or incomplete arguments", usage);
} else {
  const domain = values.domain?.toLowerCase();
  const payTo = values["pay-to"];
  const preflight = values.preflight;
  if (domain === undefined || !hostPattern.test(domain) || classifyHostname(domain) !== "ok") {
    fail("--domain must be a public host name without scheme or path", usage);
  } else if (payTo === undefined || !algosdk.isValidAddress(payTo)) {
    fail("--pay-to must be an Algorand address", usage);
  } else if (preflight === undefined || !/^[A-Za-z0-9_-]{1,64}$/.test(preflight)) {
    fail("--preflight must be a preflight id", usage);
  } else {
    await verify(domain, payTo, preflight, values.out);
  }
}
