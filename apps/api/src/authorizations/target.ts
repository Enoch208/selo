import { parseTarget, type Target } from "../net/target";
import { invalidRequest } from "../http/errors";

const reasons = {
  TARGET_URL_INVALID: "The target URL is not a valid absolute URL",
  TARGET_NOT_HTTPS: "Only https targets can be authorized",
  TARGET_ADDRESS_BLOCKED: "The target must be a public hostname on the default https port",
} as const;

export function authorizableTarget(targetUrl: string): Target {
  const parsed = parseTarget(targetUrl);
  if (!parsed.ok) {
    throw invalidRequest(reasons[parsed.reason], parsed.reason);
  }
  return parsed.target;
}
