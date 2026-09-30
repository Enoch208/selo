export { sha256Hex } from "../ids";

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(ordered);
  }
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, ordered(entry)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(ordered(value));
}
