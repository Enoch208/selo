export type LimitedText =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly kind: "too_large"; readonly maxBytes: number }
  | { readonly ok: false; readonly kind: "timeout" | "network"; readonly cause: unknown };

const isTimeout = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "TimeoutError";

function declaredTooLarge(response: Response, maxBytes: number): boolean {
  const declared = Number(response.headers.get("content-length") ?? "0");
  return Number.isFinite(declared) && declared > maxBytes;
}

export async function readLimitedText(response: Response, maxBytes: number): Promise<LimitedText> {
  if (declaredTooLarge(response, maxBytes)) {
    await response.body?.cancel();
    return { ok: false, kind: "too_large", maxBytes };
  }
  if (response.body === null) {
    return { ok: true, text: "" };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      const bytes: unknown = chunk.value;
      if (!(bytes instanceof Uint8Array)) {
        await reader.cancel();
        return {
          ok: false,
          kind: "network",
          cause: new TypeError("response body is not a byte stream"),
        };
      }
      received += bytes.byteLength;
      if (received > maxBytes) {
        await reader.cancel();
        return { ok: false, kind: "too_large", maxBytes };
      }
      text += decoder.decode(bytes, { stream: true });
    }
  } catch (error: unknown) {
    return { ok: false, kind: isTimeout(error) ? "timeout" : "network", cause: error };
  }
  return { ok: true, text: text + decoder.decode() };
}
