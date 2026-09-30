import { appendFile, chmod, readFile } from "node:fs/promises";

const keyPattern = /^[A-Z_][A-Z0-9_]*$/;

async function currentText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error: unknown) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export function hasEnvKey(text: string, key: string): boolean {
  return new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`, "m").test(text);
}

export async function addEnvKeyIfAbsent(
  path: string,
  key: string,
  value: string,
): Promise<"written" | "present"> {
  if (!keyPattern.test(key)) {
    throw new Error("env key must be upper-case letters, digits and underscores");
  }
  if (/[\r\n]/.test(value)) {
    throw new Error("env value must be a single line");
  }
  const text = await currentText(path);
  if (text !== null && hasEnvKey(text, key)) {
    return "present";
  }
  if (text !== null) {
    await chmod(path, 0o600);
  }
  const separator = text === null || text === "" || text.endsWith("\n") ? "" : "\n";
  await appendFile(path, `${separator}${key}=${value}\n`, { mode: 0o600 });
  await chmod(path, 0o600);
  return "written";
}
