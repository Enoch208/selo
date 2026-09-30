import algosdk from "algosdk";
import { describe, expect, it } from "vitest";
import { algorandWords } from "../../src/evidence/algorand-words";
import { sanitize } from "../../src/evidence/sanitize";
import { hashTag } from "../../src/evidence/secret-values";

const seed = Uint8Array.from({ length: 32 }, (_, index) => (index * 37 + 11) % 256);
const mnemonic = algosdk.mnemonicFromSeed(seed);

const prose =
  "our team shipped the release gate after many weeks with careful review and every check passed with clear evidence from both payment legs while the whole crew could sleep";

describe("mnemonic detection by value", () => {
  it("uses a real 25 word Algorand mnemonic", () => {
    expect(mnemonic.split(" ")).toHaveLength(25);
  });

  it("hashes a lowercase space separated mnemonic under an innocent key", () => {
    expect(sanitize({ note: mnemonic })).toEqual({ note: hashTag(mnemonic) });
  });

  it("hashes an uppercase comma separated mnemonic inside a log line", () => {
    const shouted = mnemonic.toUpperCase().split(" ").join(", ");
    expect(sanitize({ log: `Restored: ${shouted}. Done` })).toEqual({
      log: `Restored: ${hashTag(shouted)}. Done`,
    });
  });

  it("hashes a mnemonic with one mistyped word", () => {
    const words = mnemonic.split(" ");
    words[3] = "zzzz";
    const typo = words.join(" ");
    expect(sanitize({ note: typo })).toEqual({ note: hashTag(typo) });
  });

  it("hashes a mnemonic embedded in long lowercase prose", () => {
    const text = `${prose} ${mnemonic} ${prose}`;
    const sanitized = sanitize({ note: text });
    expect(JSON.stringify(sanitized)).not.toContain(mnemonic);
    expect(JSON.stringify(sanitized)).not.toContain(mnemonic.split(" ").slice(0, 6).join(" "));
  });

  it("derives the full 2048 word Algorand list from algosdk", () => {
    const words = algorandWords();
    expect(words.size).toBe(2_048);
    expect([...words][0]).toBe("abandon");
    expect([...words][2_047]).toBe("zoo");
    expect(mnemonic.split(" ").every((word) => words.has(word))).toBe(true);
  });

  it("keeps 29 words of lowercase prose that is not a wordlist run", () => {
    expect(prose).toMatch(/^[a-z]{3,8}(?: [a-z]{3,8}){28}$/);
    expect(sanitize({ note: prose })).toEqual({ note: prose });
  });
});
