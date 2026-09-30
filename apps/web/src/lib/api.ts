import type { z } from "zod";
import { apiErrorSchema } from "./wire";

export type ApiFailure =
  | {
      readonly kind: "http";
      readonly status: number;
      readonly code: string;
      readonly message: string;
    }
  | { readonly kind: "network"; readonly message: string }
  | { readonly kind: "unexpected"; readonly status: number; readonly message: string };

export type ApiResult<T> =
  | { readonly ok: true; readonly status: number; readonly data: T }
  | { readonly ok: false; readonly failure: ApiFailure };

interface SendInit {
  readonly method: "GET" | "POST";
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly cache?: RequestCache;
}

interface RawResponse {
  readonly status: number;
  readonly body: unknown;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return null;
    }
    throw error;
  }
}

async function send(path: string, init: SendInit): Promise<RawResponse | ApiFailure> {
  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers: { accept: "application/json", ...init.headers },
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : "request failed";
    return { kind: "network", message: `Could not reach Selo (${detail})` };
  }
  return { status: response.status, body: parseJson(await response.text()) };
}

function decode<T>(raw: RawResponse, schema: z.ZodType<T>): ApiResult<T> {
  const parsed = schema.safeParse(raw.body);
  if (parsed.success) {
    return { ok: true, status: raw.status, data: parsed.data };
  }
  const error = apiErrorSchema.safeParse(raw.body);
  if (error.success) {
    return {
      ok: false,
      failure: {
        kind: "http",
        status: raw.status,
        code: error.data.error,
        message: error.data.message,
      },
    };
  }
  return {
    ok: false,
    failure: {
      kind: "unexpected",
      status: raw.status,
      message: `Selo answered with an unexpected response (HTTP ${String(raw.status)})`,
    },
  };
}

export async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<ApiResult<T>> {
  const raw = await send(path, { method: "GET", cache: "no-store" });
  return "kind" in raw ? { ok: false, failure: raw } : decode(raw, schema);
}

export async function postJson<T>(
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
): Promise<ApiResult<T>> {
  const raw = await send(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return "kind" in raw ? { ok: false, failure: raw } : decode(raw, schema);
}
