import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { addEnvKeyIfAbsent } from "../../src/tools/env-file";
import { writeEvidence } from "../../src/tools/evidence-file";

const key = "SELO_CLIENT_MNEMONIC";
const words = "alpha beta gamma";

const scratch = (): Promise<string> => mkdtemp(join(tmpdir(), "selo-tools-"));
const modeOf = async (path: string): Promise<number> => (await stat(path)).mode & 0o777;

describe("addEnvKeyIfAbsent", () => {
  it("creates the file with the key and mode 0600", async () => {
    const path = join(await scratch(), ".env");
    expect(await addEnvKeyIfAbsent(path, key, words)).toBe("written");
    expect(await readFile(path, "utf8")).toBe(`${key}=${words}\n`);
    expect(await modeOf(path)).toBe(0o600);
  });

  it("appends to an existing file, keeps its lines and tightens the mode to 0600", async () => {
    const path = join(await scratch(), ".env");
    await writeFile(path, "PORT=8787", { mode: 0o644 });
    expect(await addEnvKeyIfAbsent(path, key, words)).toBe("written");
    expect(await readFile(path, "utf8")).toBe(`PORT=8787\n${key}=${words}\n`);
    expect(await modeOf(path)).toBe(0o600);
  });

  it("tightens a read-only 0444 file to 0600 before appending", async () => {
    const path = join(await scratch(), ".env");
    await writeFile(path, "PORT=1\n", { mode: 0o444 });
    expect(await addEnvKeyIfAbsent(path, key, words)).toBe("written");
    expect(await readFile(path, "utf8")).toBe(`PORT=1\n${key}=${words}\n`);
    expect(await modeOf(path)).toBe(0o600);
  });

  it("never overwrites a key that is already there, in any spelling", async () => {
    for (const line of [`${key}=old words`, `${key}=`, `  ${key} = x`, `export ${key}=x`]) {
      const path = join(await scratch(), ".env");
      const before = `PORT=1\n${line}\nHOST=h\n`;
      await writeFile(path, before, { mode: 0o644 });
      expect(await addEnvKeyIfAbsent(path, key, words)).toBe("present");
      expect(await readFile(path, "utf8")).toBe(before);
    }
  });

  it("treats a longer key with the same prefix or a commented line as absent", async () => {
    const path = join(await scratch(), ".env");
    await writeFile(path, `${key}_OLD=x\n# ${key}=y\n`);
    expect(await addEnvKeyIfAbsent(path, key, words)).toBe("written");
    expect(await readFile(path, "utf8")).toBe(`${key}_OLD=x\n# ${key}=y\n${key}=${words}\n`);
  });

  it("rejects a value or key that could inject another line", async () => {
    const path = join(await scratch(), ".env");
    await expect(addEnvKeyIfAbsent(path, key, "a\nEVIL=1")).rejects.toThrow(/single line/);
    await expect(addEnvKeyIfAbsent(path, "BAD KEY", words)).rejects.toThrow(/key/);
  });
});

describe("writeEvidence", () => {
  it("writes sanitized pretty JSON with capturedAt first", async () => {
    const dir = join(await scratch(), "evidence");
    const capturedAt = new Date("2026-09-27T10:00:00.000Z");
    const path = await writeEvidence(
      dir,
      "g1-merchant.json",
      { a: 1, signature: "sekrit" },
      capturedAt,
    );
    const text = await readFile(path, "utf8");
    const parsed: unknown = JSON.parse(text);
    expect(text.startsWith('{\n  "capturedAt": ')).toBe(true);
    expect(parsed).toMatchObject({ capturedAt: "2026-09-27T10:00:00.000Z", a: 1 });
    expect(text).not.toContain("sekrit");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("refuses a file name that escapes the directory", async () => {
    const dir = await scratch();
    await expect(writeEvidence(dir, "../x.json", {}, new Date())).rejects.toThrow(/file name/);
  });
});
