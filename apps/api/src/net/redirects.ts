import { blocked } from "./errors";

export interface Hop {
  readonly url: string;
  readonly method: string;
  readonly headers: readonly [string, string][];
  readonly body: Uint8Array | null;
}

export const maxRedirects = 3;

const redirectStatuses = new Set([301, 302, 303, 307, 308]);

const secretHeaders = new Set([
  "payment-signature",
  "x-payment",
  "authorization",
  "cookie",
  "proxy-authorization",
]);

const bodyHeaders = new Set([
  "content-type",
  "content-length",
  "content-encoding",
  "content-language",
]);

export const isRedirect = (status: number, location: string | null): location is string =>
  redirectStatuses.has(status) && location !== null;

const withoutHeaders = (hop: Hop, names: ReadonlySet<string>): Hop["headers"] =>
  hop.headers.filter(([name]) => !names.has(name.toLowerCase()));

export function redirectedHop(hop: Hop, status: number, location: string, base: string): Hop {
  const url = URL.parse(location, base);
  if (url === null) {
    throw blocked("TARGET_URL_INVALID");
  }
  const headers = withoutHeaders(hop, secretHeaders);
  if (status === 307 || status === 308) {
    return { url: url.href, method: hop.method, headers, body: hop.body };
  }
  const bodiless = withoutHeaders({ ...hop, headers }, bodyHeaders);
  return { url: url.href, method: "GET", headers: bodiless, body: null };
}
