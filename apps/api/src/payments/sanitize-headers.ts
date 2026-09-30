import { createHash } from "node:crypto";

const secretHeaders = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "payment-signature",
  "x-payment",
  "proxy-authorization",
]);

export const sha256Tag = (value: string): string =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

export function sanitizeHeaders(headers: Headers): Record<string, string> {
  const sanitized: Record<string, string> = {};
  for (const [name, value] of headers) {
    if (name !== "set-cookie") {
      sanitized[name] = secretHeaders.has(name) ? sha256Tag(value) : value;
    }
  }
  const cookies = headers.getSetCookie();
  if (cookies.length > 0) {
    sanitized["set-cookie"] = cookies.map(sha256Tag).join(", ");
  }
  return sanitized;
}
