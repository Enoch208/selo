import algosdk from "algosdk";

const wordCount = 2_048;
const seedBytes = 32;
const lowByteMask = 0xff;
const byteBits = 8;

function wordAt(index: number): string {
  const seed = new Uint8Array(seedBytes);
  seed[0] = index & lowByteMask;
  seed[1] = index >> byteBits;
  const [first] = algosdk.mnemonicFromSeed(seed).split(" ");
  if (first === undefined) {
    throw new RangeError(`algosdk produced no word for index ${String(index)}`);
  }
  return first;
}

let words: ReadonlySet<string> | null = null;

export function algorandWords(): ReadonlySet<string> {
  words ??= new Set(Array.from({ length: wordCount }, (_, index) => wordAt(index)));
  return words;
}
