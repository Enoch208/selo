import algosdk from "algosdk";
import { describe, expect, it } from "vitest";
import { createAvmPaymentScheme, operatingAddress } from "../../src/payments/wallet";

const account = algosdk.generateAccount();
const mnemonic = algosdk.secretKeyToMnemonic(account.sk);
const secretKeyBase64 = Buffer.from(account.sk).toString("base64");

const wordPairs = (phrase: string): string[] => {
  const words = phrase.split(" ");
  return words.slice(1).map((word, index) => `${words[index] ?? ""} ${word}`);
};

const expectNoMnemonic = (serialised: string, phrase: string): void => {
  for (const pair of wordPairs(phrase)) {
    expect(serialised).not.toContain(pair);
  }
};

const errorOf = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error: unknown) {
    return error;
  }
  return null;
};

describe("operating wallet", () => {
  it("derives the operating address from the mnemonic without touching the network", () => {
    expect(operatingAddress(mnemonic)).toBe(account.addr.toString());
  });

  it("builds the exact AVM client scheme signing as that address", () => {
    const scheme = createAvmPaymentScheme(mnemonic, "https://testnet-api.algonode.cloud");
    expect(scheme.scheme).toBe("exact");
    expect(JSON.stringify(scheme)).toContain(account.addr.toString());
  });

  it("A22 (client): the scheme serialises without the mnemonic or the secret key", () => {
    const scheme = createAvmPaymentScheme(mnemonic, "https://testnet-api.algonode.cloud");
    const serialised = JSON.stringify(scheme);
    expectNoMnemonic(serialised, mnemonic);
    expect(serialised).not.toContain(secretKeyBase64);
  });

  it("A22 (client): an invalid mnemonic fails with a message that carries none of its words", () => {
    const broken = [...mnemonic.split(" ").slice(0, 24), "zzzzzz"].join(" ");
    for (const run of [() => operatingAddress(broken), () => createAvmPaymentScheme(broken, "x")]) {
      const error = errorOf(run);
      expect(error).toBeInstanceOf(Error);
      const serialised = `${String(error)} ${JSON.stringify(error)}`;
      expectNoMnemonic(serialised, broken);
      expect(serialised).not.toContain("zzzzzz");
    }
  });
});
