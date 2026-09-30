import { classifyHostname, type PreflightRejection } from "@selo/core";

export type TargetRejection = Extract<
  PreflightRejection,
  "TARGET_URL_INVALID" | "TARGET_NOT_HTTPS" | "TARGET_ADDRESS_BLOCKED"
>;

export interface Target {
  readonly href: string;
  readonly origin: string;
  readonly hostname: string;
  readonly path: string;
}

export type ParsedTarget =
  | { readonly ok: true; readonly target: Target }
  | { readonly ok: false; readonly reason: TargetRejection };

const reject = (reason: TargetRejection): ParsedTarget => ({ ok: false, reason });

export function parseTarget(raw: string): ParsedTarget {
  const url = URL.parse(raw);
  if (url === null) {
    return reject("TARGET_URL_INVALID");
  }
  if (url.protocol !== "https:") {
    return reject("TARGET_NOT_HTTPS");
  }
  if (url.hostname === "" || url.username !== "" || url.password !== "") {
    return reject("TARGET_URL_INVALID");
  }
  if (url.port !== "" || classifyHostname(url.hostname) !== "ok") {
    return reject("TARGET_ADDRESS_BLOCKED");
  }
  url.hash = "";
  return {
    ok: true,
    target: { href: url.href, origin: url.origin, hostname: url.hostname, path: url.pathname },
  };
}
