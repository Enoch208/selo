import { describe, expect, it } from "vitest";
import {
  leaderboardPageSchema,
  merchantsPageSchema,
  resourcesPageSchema,
} from "../../src/tools/facilitator-schemas";
import {
  leaderboardRowsFor,
  merchantsFor,
  nextOffset,
  resourcesForDomain,
} from "../../src/tools/facilitator-selectors";
import leaderboard from "./fixtures/leaderboard-challenge.json";
import merchants from "./fixtures/merchants-page.json";
import resources from "./fixtures/resources-page.json";

const resourcesPage = resourcesPageSchema.parse(resources);
const merchantsPage = merchantsPageSchema.parse(merchants);
const leaderboardPage = leaderboardPageSchema.parse(leaderboard);

describe("facilitator schemas", () => {
  it("parse the live discovery, merchant and leaderboard shapes", () => {
    expect(resourcesPage.items).toHaveLength(5);
    expect(resourcesPage.pagination).toEqual({ limit: 5, offset: 0, total: 2329 });
    expect(merchantsPage.items).toHaveLength(5);
    expect(leaderboardPage.items).toHaveLength(5);
    expect(leaderboardPage.total).toBe(115);
  });

  it("keep the blocked marker of a leaderboard row", () => {
    const blocked = leaderboardPage.items.find((row) => row.blocked !== undefined);
    expect(blocked?.blocked?.reason).toBe("synthetic payment traffic");
  });

  it("reject a page whose items are not an array", () => {
    expect(resourcesPageSchema.safeParse({ ...resources, items: {} }).success).toBe(false);
    expect(leaderboardPageSchema.safeParse({ items: [{ rank: "1" }], total: 1 }).success).toBe(
      false,
    );
  });
});

describe("resourcesForDomain", () => {
  it("selects every catalog record whose URL host is the domain", () => {
    const selected = resourcesForDomain(resourcesPage.items, "civitas-api.civitasv.workers.dev");
    expect(selected.map((item) => item.resourceUrl)).toEqual([
      "https://civitas-api.civitasv.workers.dev/v1/report/risk-score",
      "https://civitas-api.civitasv.workers.dev/v1/identity/proof",
      "https://civitas-api.civitasv.workers.dev/v1/attest",
      "https://civitas-api.civitasv.workers.dev/v1/message/send",
    ]);
  });

  it("does not match a host that merely contains the domain", () => {
    expect(resourcesForDomain(resourcesPage.items, "civitasv.workers.dev")).toEqual([]);
    expect(resourcesForDomain(resourcesPage.items, "pronodealgo.xyz")).toEqual([]);
  });
});

describe("merchantsFor", () => {
  it("selects the merchant whose AVM address is payTo", () => {
    const address = "JTN2G23WP3GBIK7CZYABI4NWMKCN2YVSXDYHY4IMIQB7TPXPELRFGMYP64";
    const selected = merchantsFor(merchantsPage.items, address);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.totalSettlements).toBe(525147);
  });

  it("ignores EVM addresses and unknown payTo", () => {
    expect(merchantsFor(merchantsPage.items, "0x9dBA414637c611a16BEa6f0796BFcbcBdc410df8")).toEqual(
      [],
    );
    expect(merchantsFor(merchantsPage.items, "NOPE")).toEqual([]);
  });
});

describe("leaderboardRowsFor", () => {
  it("selects the rows whose address is payTo", () => {
    const address = "C7ZWCTZ43UPELPFLWGGRQPUCUFDU63MB7EVWI7GVVEDB3YTCQVIICP2FLE";
    const rows = leaderboardRowsFor(leaderboardPage.items, address);
    expect(rows.map((row) => [row.rank, row.settles, row.challenge])).toEqual([[2, 84, true]]);
    expect(leaderboardRowsFor(leaderboardPage.items, "NOPE")).toEqual([]);
  });
});

describe("nextOffset", () => {
  it("advances by the items received until the total is reached", () => {
    expect(nextOffset({ offset: 0, received: 1000, total: 2329 })).toBe(1000);
    expect(nextOffset({ offset: 2000, received: 329, total: 2329 })).toBeNull();
  });

  it("stops on an empty page so a lying total cannot loop forever", () => {
    expect(nextOffset({ offset: 50, received: 0, total: 115 })).toBeNull();
  });
});
