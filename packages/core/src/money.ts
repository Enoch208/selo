import type { DecimalAmount } from "./contract";

export const microsPerUnit = 1_000_000;

const fractionDigits = 6;
const decimalPattern = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,6}))?$/;
const atomicUnitsPattern = /^(0|[1-9][0-9]*)$/;
const maxSafeMicros = BigInt(Number.MAX_SAFE_INTEGER);

export function parseMicros(value: string): number | null {
  const match = decimalPattern.exec(value);
  if (match === null) {
    return null;
  }
  const whole = match[1] ?? "0";
  const fraction = (match[2] ?? "").padEnd(fractionDigits, "0");
  const micros = BigInt(whole) * BigInt(microsPerUnit) + BigInt(fraction);
  if (micros > maxSafeMicros) {
    return null;
  }
  return Number(micros);
}

export function formatMicros(micros: number): DecimalAmount {
  if (!Number.isSafeInteger(micros)) {
    throw new RangeError(`Amount in micros must be a safe integer, received ${String(micros)}`);
  }
  const sign = micros < 0 ? "-" : "";
  const magnitude = Math.abs(micros);
  const whole = Math.floor(magnitude / microsPerUnit);
  const fraction = String(magnitude % microsPerUnit)
    .padStart(fractionDigits, "0")
    .replace(/0+$/, "")
    .padEnd(2, "0");
  return `${sign}${String(whole)}.${fraction}`;
}

export function parseAtomicUnits(value: string): number | null {
  if (!atomicUnitsPattern.test(value)) {
    return null;
  }
  const amount = BigInt(value);
  if (amount > maxSafeMicros) {
    return null;
  }
  return Number(amount);
}
