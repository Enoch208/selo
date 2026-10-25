import { z } from "zod";

export type CliFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type Answer =
  | { readonly kind: "answered"; readonly status: number; readonly body: unknown }
  | { readonly kind: "unreachable"; readonly message: string };

const apiErrorSchema = z.looseObject({ error: z.string(), message: z.string() });

export function errorText(body: unknown): string {
  const parsed = apiErrorSchema.safeParse(body);
  return parsed.success ? `${parsed.data.error}: ${parsed.data.message}` : JSON.stringify(body);
}

export function errorCode(body: unknown): string | null {
  const parsed = apiErrorSchema.safeParse(body);
  return parsed.success ? parsed.data.error : null;
}

function describe(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  while (current instanceof Error && messages.length < 4) {
    messages.push(current.message);
    current = current.cause;
  }
  return messages.length === 0 ? String(error) : messages.join(": ");
}

async function bodyOf(response: Response): Promise<unknown> {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { error: `HTTP_${String(response.status)}`, message: text.slice(0, 300) };
  }
}

export async function callApi(
  fetch: CliFetch,
  url: string,
  method: "GET" | "POST",
  body?: unknown,
): Promise<Answer> {
  try {
    const response = await fetch(url, {
      method,
      headers: { accept: "application/json", "content-type": "application/json" },
      redirect: "manual",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { kind: "answered", status: response.status, body: await bodyOf(response) };
  } catch (error: unknown) {
    return { kind: "unreachable", message: `${method} ${url} failed: ${describe(error)}` };
  }
}
