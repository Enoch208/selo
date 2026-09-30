import { describe, expect, it } from "vitest";
import { formatMicros, microsPerUnit, parseAtomicUnits, parseMicros } from "../src/money";

describe("microsPerUnit", () => {
  it("is one million", () => {
    expect(microsPerUnit).toBe(1_000_000);
  });
});

describe("parseMicros", () => {
  it.each([
    ["0", 0],
    ["1", 1_000_000],
    ["0.05", 50_000],
    ["0.000001", 1],
    ["0.40", 400_000],
    ["12.5", 12_500_000],
    ["9007199254.740991", Number.MAX_SAFE_INTEGER],
  ])("parses %s to %i micros", (input, expected) => {
    expect(parseMicros(input)).toBe(expected);
  });

  it.each([
    "01",
    ".5",
    "1.",
    "1.0000001",
    "-1",
    " 1",
    "1 ",
    "1e3",
    "1E3",
    "1e-3",
    "abc",
    "",
    "0x10",
    "1,5",
    "+1",
    "9007199254.740992",
    "100000000000000000000",
  ])("rejects %j", (input) => {
    expect(parseMicros(input)).toBeNull();
  });
});

describe("formatMicros", () => {
  it.each([
    [50_000, "0.05"],
    [1_000_000, "1.00"],
    [1, "0.000001"],
    [125_000, "0.125"],
    [0, "0.00"],
    [-200_000, "-0.20"],
  ])("formats %i as %s", (input, expected) => {
    expect(formatMicros(input)).toBe(expected);
  });

  it("throws RangeError for non-safe-integer input", () => {
    expect(() => formatMicros(0.5)).toThrow(RangeError);
    expect(() => formatMicros(Number.MAX_SAFE_INTEGER + 1)).toThrow(RangeError);
    expect(() => formatMicros(Number.NaN)).toThrow(RangeError);
  });

  it("round-trips parse after format over a range of values", () => {
    for (let micros = 0; micros <= 5_000_000; micros += 37_000) {
      expect(parseMicros(formatMicros(micros))).toBe(micros);
    }
    for (const micros of [1, 12, 999_999, 1_000_001, 123_456_789, Number.MAX_SAFE_INTEGER]) {
      expect(parseMicros(formatMicros(micros))).toBe(micros);
    }
  });
});

describe("parseAtomicUnits", () => {
  it.each([
    ["0", 0],
    ["50000", 50_000],
    ["1", 1],
    ["9007199254740991", Number.MAX_SAFE_INTEGER],
  ])("parses %s to %i", (input, expected) => {
    expect(parseAtomicUnits(input)).toBe(expected);
  });

  it.each([
    "01",
    "-1",
    " 1",
    "1 ",
    "1.0",
    "1e3",
    "abc",
    "",
    "0x10",
    "+1",
    "9007199254740992",
    "100000000000000000000",
  ])("rejects %j", (input) => {
    expect(parseAtomicUnits(input)).toBeNull();
  });
});
