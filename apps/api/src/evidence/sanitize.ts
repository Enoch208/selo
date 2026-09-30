import { canonicalJson } from "./canonical";
import { isAuthorizationSnapshot, isSecretKey } from "./secret-keys";
import { hashTag, scrubSecretValues } from "./secret-values";

const maxStringLength = 4_096;
const maxDepth = 12;
const redacted = "[redacted]";
const depthLimit = "[depth limit]";

function truncated(text: string): string {
  if (text.length <= maxStringLength) {
    return text;
  }
  const cut = text.length - maxStringLength;
  return `${text.slice(0, maxStringLength)}…[truncated ${String(cut)} chars]`;
}

function containsSecrets(value: unknown): boolean {
  return canonicalJson(sanitize(value)) !== canonicalJson(value);
}

function isDropped(value: unknown): boolean {
  return value === undefined || typeof value === "function" || typeof value === "symbol";
}

function secretEntry(value: unknown): string {
  return typeof value === "string" ? hashTag(value) : redacted;
}

function sanitizeEntry(key: string, entry: unknown, depth: number): unknown {
  if (isSecretKey(key) && !isAuthorizationSnapshot(key, entry)) {
    return secretEntry(entry);
  }
  return sanitizeAt(entry, depth + 1);
}

function sanitizeEntries(entries: Iterable<[string, unknown]>, depth: number): unknown {
  const copy: Record<string, unknown> = {};
  for (const [key, entry] of entries) {
    if (!isDropped(entry)) {
      copy[key] = sanitizeEntry(key, entry, depth);
    }
  }
  return copy;
}

function sanitizeAt(value: unknown, depth: number): unknown {
  if (typeof value === "string") {
    return truncated(scrubSecretValues(value, containsSecrets));
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value !== "object" || value === null) {
    return isDropped(value) ? null : value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (depth >= maxDepth) {
    return depthLimit;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => (isDropped(item) ? null : sanitizeAt(item, depth + 1)));
  }
  if (value instanceof Headers) {
    return sanitizeEntries(value.entries(), depth);
  }
  return sanitizeEntries(Object.entries(value), depth);
}

export function sanitize(value: unknown): unknown {
  return sanitizeAt(value, 0);
}
