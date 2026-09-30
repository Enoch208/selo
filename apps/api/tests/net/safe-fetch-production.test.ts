import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { createSafeFetch } from "../../src/net/safe-fetch";
import { safeErrorOf } from "./safe-fetch-harness";

const sourceRoot = join(import.meta.dirname, "../../src");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("production safe fetch", () => {
  it("accepts only the allowed origin and timeout, and still blocks before any DNS", async () => {
    const safeFetch = createSafeFetch({
      allowedOrigin: "https://api.example.com",
      timeoutMs: 1_000,
    });
    for (const [url, reason] of [
      ["https://127.0.0.1/v1", "TARGET_ADDRESS_BLOCKED"],
      ["https://metadata.google.internal/v1", "TARGET_ADDRESS_BLOCKED"],
      ["http://api.example.com/v1", "TARGET_NOT_HTTPS"],
      ["https://other.example.com/v1", "ORIGIN_NOT_ALLOWED"],
    ] as const) {
      const error = await safeErrorOf(safeFetch(url));
      expect(error.failure, url).toEqual({ kind: "blocked", reason });
      expect(error.afterDispatch, url).toBe(false);
    }
  });

  it("keeps the seam-taking engine out of every production module but the safe fetch itself", () => {
    const importers = sourceFiles(sourceRoot)
      .filter((path) => readFileSync(path, "utf8").includes("fetch-engine"))
      .map((path) => relative(sourceRoot, path));
    expect(importers).toEqual(["net/safe-fetch.ts"]);
  });
});
