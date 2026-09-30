import type { JsonValue } from "@selo/core";
import { z } from "zod";

const jsonValue: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);

export type ParsedBody =
  | { readonly ok: true; readonly value: JsonValue | undefined }
  | { readonly ok: false; readonly message: string };

export function parseRequestBody(text: string): ParsedBody {
  if (text.trim() === "") {
    return { ok: true, value: undefined };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return { ok: false, message: `The request body is not valid JSON: ${error.message}` };
    }
    throw error;
  }
  const parsed = jsonValue.safeParse(raw);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, message: "The request body must be plain JSON." };
}
