import { chmodSync, existsSync, mkdtempSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ReportsDirUnusable, ensureReportsDir } from "../../src/reports/packet";

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "selo-reports-dir-"));
}

describe("ensureReportsDir", () => {
  it("creates a missing directory privately and accepts it", async () => {
    const dir = join(scratch(), "nested", "reports");
    await ensureReportsDir(dir);
    expect(existsSync(dir)).toBe(true);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  it("refuses a path that cannot be created because a file is in the way", async () => {
    const base = scratch();
    writeFileSync(join(base, "blocker"), "x");
    await expect(ensureReportsDir(join(base, "blocker", "reports"))).rejects.toThrow(
      ReportsDirUnusable,
    );
  });

  it("refuses a directory it cannot write into", async () => {
    const dir = scratch();
    chmodSync(dir, 0o500);
    try {
      await expect(ensureReportsDir(dir)).rejects.toThrow(/REPORTS_DIR .* is not writable/);
    } finally {
      chmodSync(dir, 0o700);
    }
  });
});
