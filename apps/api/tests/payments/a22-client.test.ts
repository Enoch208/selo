import algosdk from "algosdk";
import { describe, expect, it } from "vitest";
import { createDownstreamPayer, type FetchLike } from "../../src/payments/downstream";
import { createAvmPaymentScheme, operatingAddress } from "../../src/payments/wallet";
import { createFakeScheme, type FakeScheme } from "./fake-scheme";
import { challengeFor, createFakeSeller, offeredAccept, sellerFetch, testnet } from "./fake-seller";

const url = "https://seller.test/paid";
const requirement = {
  network: offeredAccept.network,
  asset: offeredAccept.asset,
  amount: offeredAccept.amount,
  payTo: offeredAccept.payTo,
};

interface Exposure {
  readonly serialised: string;
  readonly secrets: readonly string[];
}

const settle = <T>(pending: Promise<T>): Promise<unknown> =>
  pending.then(
    (value) => value,
    (error: unknown) => error,
  );

function show(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value);
  return `${JSON.stringify(value)} ${text}`;
}

async function exposureFor(mnemonic: string): Promise<Exposure> {
  const seller = createFakeSeller();
  const scheme: FakeScheme = createFakeScheme();
  const payer = createDownstreamPayer({ fetch: sellerFetch(seller), scheme, network: testnet });
  const base = { url, method: "POST" as const, operationId: "op-a22", timeoutMs: 1_000 };
  const pay = { ...base, decoded: challengeFor(url), requirement, maxBodyBytes: 1_024 };
  const delivered = await payer.pay({ ...pay, body: { q: 1 } });
  const replayed =
    delivered.kind === "delivered"
      ? await payer.replay({ ...base, replayHeader: delivered.replayHeader })
      : null;
  seller.behaviour.paidStatus = 402;
  seller.behaviour.settlement = "failed";
  const rejected = await payer.pay(pay);
  const hanging: FetchLike = () => new Promise<Response>(() => undefined);
  const ambiguous = await createDownstreamPayer({ fetch: hanging, scheme, network: testnet }).pay({
    ...pay,
    timeoutMs: 20,
  });
  const mismatch = await settle(
    payer.pay({ ...pay, requirement: { ...requirement, amount: "1" } }),
  );
  const broken = `${mnemonic.split(" ").slice(0, 24).join(" ")} zzzzzz`;
  const invalid = await settle(Promise.resolve().then(() => operatingAddress(broken)));
  const realScheme = createAvmPaymentScheme(mnemonic, "https://testnet-api.algonode.cloud");
  const values = [delivered, replayed, rejected, ambiguous, mismatch, invalid, payer, realScheme];
  const signatures = seller.paidRequests.map((request) => request.signature);
  const signedBytes = scheme.signed.flatMap((fixture) => [...fixture.paymentGroup]);
  return { serialised: values.map(show).join("\n"), secrets: [...signatures, ...signedBytes] };
}

const tokensOf = (text: string): Set<string> =>
  new Set(
    text
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((token) => token.length >= 4),
  );

const longWords = (mnemonic: string): string[] =>
  mnemonic.split(" ").filter((word) => word.length >= 4);

async function mnemonicDisjointFromFixtureVocabulary(): Promise<algosdk.Account> {
  const baseline = algosdk.generateAccount();
  const vocabulary = tokensOf(
    (await exposureFor(algosdk.secretKeyToMnemonic(baseline.sk))).serialised,
  );
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const account = algosdk.generateAccount();
    const words = longWords(algosdk.secretKeyToMnemonic(account.sk));
    if (words.every((word) => !vocabulary.has(word))) {
      return account;
    }
  }
  throw new Error("no mnemonic disjoint from the fixture vocabulary");
}

describe("A22 (client): no mnemonic or signed payment value appears in any result, error message or serialised object", () => {
  it("keeps signed headers, signed group bytes and every mnemonic word out of all outcomes", async () => {
    const account = await mnemonicDisjointFromFixtureVocabulary();
    const mnemonic = algosdk.secretKeyToMnemonic(account.sk);
    const { serialised, secrets } = await exposureFor(mnemonic);

    expect(secrets.length).toBeGreaterThanOrEqual(4);
    for (const secret of secrets) {
      expect(serialised).not.toContain(secret);
    }
    expect(serialised).not.toContain(mnemonic);
    expect(serialised).not.toContain(Buffer.from(account.sk).toString("base64"));
    const tokens = tokensOf(serialised);
    expect(longWords(mnemonic).filter((word) => tokens.has(word))).toEqual([]);
    expect(tokens.has("zzzzzz")).toBe(false);
  });
});
