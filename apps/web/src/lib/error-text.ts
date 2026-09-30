import type { ApiFailure } from "./api";

const byCode: Readonly<Record<string, string>> = {
  VALIDATION_FAILED: "Some fields were not accepted.",
  TARGET_URL_INVALID: "That is not a valid absolute URL. Include https:// and the full path.",
  TARGET_NOT_HTTPS: "Selo only tests https endpoints.",
  TARGET_ADDRESS_BLOCKED:
    "The target must be a public hostname on the default https port (no IP addresses, localhost or custom ports).",
  VERIFICATION_FAILED:
    "The verification file is reachable but does not contain the expected selo-verification line yet.",
  VERIFICATION_UNREACHABLE: "Selo could not fetch the verification file from your origin.",
  CHALLENGE_EXPIRED: "This challenge expired (challenges last one hour). Request a new one.",
  AUTHORIZATION_EXPIRED: "This authorization expired. Request a new challenge.",
  AUTHORIZATION_REVOKED: "This authorization was revoked. Request a new challenge.",
  PAYLOAD_TOO_LARGE: "The request body is larger than 64 KiB.",
  NOT_FOUND: "Selo does not know that id.",
  INTERNAL: "Selo hit an internal error. Nothing was charged; try again shortly.",
};

export interface FailureText {
  readonly title: string;
  readonly detail: string | null;
}

export function describeFailure(failure: ApiFailure): FailureText {
  if (failure.kind === "network") {
    return { title: "Selo is unreachable right now.", detail: failure.message };
  }
  if (failure.kind === "unexpected") {
    return { title: "Unexpected response.", detail: failure.message };
  }
  const known = byCode[failure.code];
  if (known === undefined) {
    return { title: failure.message, detail: `${failure.code} · HTTP ${String(failure.status)}` };
  }
  return { title: known, detail: `${failure.code}: ${failure.message}` };
}
