import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { httpMethods, verdicts } from "@selo/core";
import { z } from "zod";

export const runPhases = ["paying", "unresolved", "rejected", "concluded"] as const;
export type RunPhase = (typeof runPhases)[number];

const runStateSchema = z.strictObject({
  schema: z.literal("selo.cli.run.v1"),
  release: z.string(),
  api: z.string(),
  target: z.strictObject({ url: z.string(), method: z.enum(httpMethods) }),
  network: z.string(),
  payer: z.string(),
  preflightId: z.string(),
  idempotencyKey: z.string(),
  phase: z.enum(runPhases),
  message: z.string(),
  expectedInboundTxId: z.string().nullable(),
  jobId: z.string().nullable(),
  verdict: z.enum(verdicts).nullable(),
  reportUrl: z.string().nullable(),
  updatedAt: z.string(),
});

export type RunState = z.infer<typeof runStateSchema>;

export type LoadedState =
  | { readonly kind: "none" }
  | { readonly kind: "found"; readonly state: RunState }
  | { readonly kind: "unreadable"; readonly path: string };

export const statePath = (dir: string, release: string): string => join(dir, `${release}.json`);

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

export async function loadState(dir: string, release: string): Promise<LoadedState> {
  const path = statePath(dir, release);
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error: unknown) {
    return isMissing(error) ? { kind: "none" } : { kind: "unreadable", path };
  }
  try {
    const parsed = runStateSchema.safeParse(JSON.parse(text));
    return parsed.success ? { kind: "found", state: parsed.data } : { kind: "unreadable", path };
  } catch {
    return { kind: "unreadable", path };
  }
}

export async function saveState(dir: string, state: RunState): Promise<string> {
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const path = statePath(dir, state.release);
  const pending = `${path}.tmp`;
  await writeFile(pending, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
  await chmod(pending, 0o600);
  await rename(pending, path);
  return path;
}

export const blocksNewPayment = (phase: RunPhase): boolean =>
  phase === "paying" || phase === "unresolved";
