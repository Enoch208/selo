import { readFile } from "node:fs/promises";
import { compileContract, type ExpectedContract, type JsonValue } from "@selo/core";
import { z } from "zod";
import { fromInvocationDir, UsageError } from "./options";

const maxFileBytes = 64 * 1024;

const contractSchema = z.strictObject({
  status: z.number().int().optional(),
  contentType: z.string().max(200).optional(),
  jsonSchema: z.record(z.string(), z.unknown()).optional(),
});

async function readJson(path: string, what: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(fromInvocationDir(path), "utf8");
  } catch {
    throw new UsageError(`could not read the ${what} file ${path}`);
  }
  if (Buffer.byteLength(text) > maxFileBytes) {
    throw new UsageError(`the ${what} file ${path} is larger than 64 KiB`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new UsageError(`the ${what} file ${path} is not valid JSON`);
  }
}

export async function loadContract(path: string): Promise<ExpectedContract> {
  const parsed = contractSchema.safeParse(await readJson(path, "contract"));
  if (!parsed.success) {
    throw new UsageError(
      `the contract file ${path} must be { status?, contentType?, jsonSchema? }: ${parsed.error.issues[0]?.message ?? "invalid"}`,
    );
  }
  const { status, contentType, jsonSchema } = parsed.data;
  const contract: ExpectedContract = {
    ...(status === undefined ? {} : { status }),
    ...(contentType === undefined ? {} : { contentType }),
    ...(jsonSchema === undefined ? {} : { jsonSchema }),
  };
  const compiled = compileContract(contract);
  if (!compiled.ok) {
    throw new UsageError(`the contract file ${path} is not usable: ${compiled.issue}`);
  }
  return contract;
}

const jsonValueSchema = z.json();

export async function loadBody(path: string): Promise<JsonValue> {
  const parsed = jsonValueSchema.safeParse(await readJson(path, "request body"));
  if (!parsed.success || parsed.data === null) {
    throw new UsageError(`the request body file ${path} must hold a JSON value other than null`);
  }
  return parsed.data;
}
