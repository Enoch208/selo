import { describe, expect, it } from "vitest";
import { leaderboardRowSchema, resourceRecordSchema } from "../../src/tools/facilitator-schemas";
import {
  checkBazaar,
  checkChallenge,
  checkLeaderboard,
  checkMerchant,
  type G1Check,
} from "../../src/tools/g1-checks";
import leaderboard from "./fixtures/leaderboard-challenge.json";
import resources from "./fixtures/resources-page.json";
import selo402 from "./fixtures/selo-402.json";

const payTo = "XMBY7EABEU6YPDJRCBISZDFM4MPYLHH5V6TVWYDU5LIIT2NC3SGHKANNQI";
const tagged = {
  ...selo402,
  resource: { ...selo402.resource, tags: ["x402-global-challenge"] },
};
const firstAccept = tagged.accepts[0];

const byId = (checks: readonly G1Check[], id: string): G1Check | undefined =>
  checks.find((check) => check.id === id);

const passes = (checks: readonly G1Check[]): Record<string, boolean> =>
  Object.fromEntries(checks.map((check) => [check.id, check.pass]));

const challengeRead = (decoded: unknown, status = 402) => ({
  ok: true as const,
  value: { status, decoded, decodeError: null },
});

describe("checkChallenge (A01-A04)", () => {
  it("passes a tagged Mainnet USDC challenge to payTo with Bazaar metadata", () => {
    expect(passes(checkChallenge(challengeRead(tagged), payTo))).toEqual({
      A01: true,
      A02: true,
      A03: true,
      A04: true,
    });
  });

  it("A03 fails when resource.tags lacks the challenge tag", () => {
    const check = byId(checkChallenge(challengeRead(selo402), payTo), "A03");
    expect(check?.pass).toBe(false);
    expect(check?.detail).toMatch(/resource\.tags/);
  });

  it("A03 fails when the accepted requirement carries no challenge tag", () => {
    const untagged = {
      ...tagged,
      accepts: [{ ...firstAccept, extra: { ...firstAccept?.extra, tag: "other" } }],
    };
    expect(byId(checkChallenge(challengeRead(untagged), payTo), "A03")?.pass).toBe(false);
  });

  it("A02 fails on Testnet, the wrong asset or a different payTo", () => {
    const variants = [
      { network: "algorand:SGO1GKSzyE7IEPItTxCByw9x8FmnrCDexi9/cOUJOiI=" },
      { asset: "10458941" },
      { payTo: "SOMEONEELSE" },
    ];
    for (const variant of variants) {
      const decoded = { ...tagged, accepts: [{ ...firstAccept, ...variant }] };
      expect(byId(checkChallenge(challengeRead(decoded), payTo), "A02")?.pass).toBe(false);
    }
  });

  it("A04 fails without a Bazaar extension carrying input and output info", () => {
    const bare = { ...tagged, extensions: undefined };
    expect(byId(checkChallenge(challengeRead(bare), payTo), "A04")?.pass).toBe(false);
    const noOutput = { ...tagged, extensions: { bazaar: { info: { input: {} }, schema: {} } } };
    expect(byId(checkChallenge(challengeRead(noOutput), payTo), "A04")?.pass).toBe(false);
  });

  it("fails every check with the reason when the probe is not a decodable 402", () => {
    const unreachable = checkChallenge({ ok: false, reason: "fetch failed: ENOTFOUND" }, payTo);
    expect(unreachable.every((check) => !check.pass)).toBe(true);
    expect(byId(unreachable, "A01")?.detail).toContain("ENOTFOUND");
    const notPaywalled = checkChallenge(challengeRead(null, 400), payTo);
    expect(byId(notPaywalled, "A01")?.detail).toContain("400");
    expect(notPaywalled.every((check) => !check.pass)).toBe(true);
  });
});

describe("checkBazaar (A07)", () => {
  const records = resources.items.map((item) => resourceRecordSchema.parse(item));

  it("passes when the domain has a catalog record", () => {
    expect(checkBazaar({ ok: true, value: records.slice(0, 1) }).pass).toBe(true);
  });

  it("fails with a reason when there is no record or the catalog is unreachable", () => {
    expect(checkBazaar({ ok: true, value: [] }).detail).toMatch(/no Bazaar resource/);
    const down = checkBazaar({ ok: false, reason: "HTTP 503" });
    expect(down).toMatchObject({ pass: false });
    expect(down.detail).toContain("HTTP 503");
  });
});

describe("checkMerchant", () => {
  it("passes when a merchant exists for payTo and fails otherwise", () => {
    const merchant = { id: "m", addresses: { avm: payTo }, totalSettlements: 3 };
    expect(checkMerchant({ ok: true, value: [merchant] }).pass).toBe(true);
    expect(checkMerchant({ ok: true, value: [] }).pass).toBe(false);
    expect(checkMerchant({ ok: false, reason: "timeout" }).detail).toContain("timeout");
  });
});

describe("checkLeaderboard (A08)", () => {
  const rows = leaderboard.items.map((item) => leaderboardRowSchema.parse(item));
  const [first, second, blockedRow] = rows;
  const empty = { "x402-global-challenge": [], bazaar: [], direct: [], dev: [] };

  it("passes with a row under x402-global-challenge", () => {
    const check = checkLeaderboard({
      ok: true,
      value: { ...empty, "x402-global-challenge": [second].filter((row) => row !== undefined) },
    });
    expect(check).toMatchObject({ id: "A08", pass: true });
    expect(check.detail).toContain("rank 2");
  });

  it("fails when volume appears only under direct or dev", () => {
    const check = checkLeaderboard({
      ok: true,
      value: { ...empty, direct: [first].filter((row) => row !== undefined) },
    });
    expect(check.pass).toBe(false);
    expect(check.detail).toMatch(/only under direct\/dev/);
  });

  it("names the sources when payTo appears only under bazaar", () => {
    const only = (row: typeof first) => [row].filter((item) => item !== undefined);
    const check = checkLeaderboard({
      ok: true,
      value: { ...empty, bazaar: only(first), dev: only(first) },
    });
    expect(check.pass).toBe(false);
    expect(check.detail).toBe("payTo appears only under bazaar, dev; no x402-global-challenge row");
  });

  it("fails when the challenge row is blocked", () => {
    const check = checkLeaderboard({
      ok: true,
      value: { ...empty, "x402-global-challenge": [blockedRow].filter((row) => row !== undefined) },
    });
    expect(check.pass).toBe(false);
    expect(check.detail).toContain("synthetic payment traffic");
  });

  it("fails with no row anywhere or when a source is unreachable", () => {
    expect(checkLeaderboard({ ok: true, value: empty }).detail).toMatch(/no leaderboard row/);
    expect(checkLeaderboard({ ok: false, reason: "src=dev: HTTP 500" }).detail).toContain(
      "src=dev",
    );
  });
});
