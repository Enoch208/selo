import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sanitize } from "../evidence/sanitize";

const fileNamePattern = /^[a-z0-9][a-z0-9-]*\.json$/;

export async function writeEvidence(
  dir: string,
  fileName: string,
  data: Readonly<Record<string, unknown>>,
  capturedAt: Date,
): Promise<string> {
  if (!fileNamePattern.test(fileName)) {
    throw new Error(`invalid evidence file name: ${fileName}`);
  }
  await mkdir(dir, { recursive: true });
  const path = join(dir, fileName);
  const body = sanitize({ capturedAt: capturedAt.toISOString(), ...data });
  await writeFile(path, `${JSON.stringify(body, null, 2)}\n`);
  return path;
}
