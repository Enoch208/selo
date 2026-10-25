import {
  authorizationStatuses,
  authorizationTypes,
  httpMethods,
  preflightRejections,
  type AuthorizationChallengeView,
  type AuthorizationView,
  type CreateAuthorizationBody,
  type PreflightBody,
  type PreflightEligible,
  type PreflightIneligible,
} from "@selo/core";
import { z } from "zod";
import { callApi, errorText, type CliFetch } from "./http";

export type Free<T> =
  | { readonly kind: "ok"; readonly value: T }
  | { readonly kind: "refused"; readonly message: string }
  | { readonly kind: "unavailable"; readonly message: string };

const challengeSchema = z.looseObject({
  authorizationId: z.string(),
  status: z.enum(authorizationStatuses),
  origin: z.string(),
  routePath: z.string(),
  method: z.enum(httpMethods),
  verificationUrl: z.string(),
  expectedContent: z.string(),
});

const authorizationSchema = z.looseObject({
  authorizationId: z.string(),
  status: z.enum(authorizationStatuses),
  origin: z.string(),
  routePath: z.string(),
  method: z.enum(httpMethods),
  type: z.enum(authorizationTypes),
  verifiedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});

const eligibleSchema = z.looseObject({
  eligible: z.literal(true),
  preflightId: z.string(),
  target: z.looseObject({ url: z.string(), method: z.enum(httpMethods), priceUsdc: z.string() }),
  estimatedMaxSpendUsdc: z.string(),
  seloPriceUsdc: z.string(),
  expiresAt: z.string(),
});

const ineligibleSchema = z.looseObject({
  eligible: z.literal(false),
  preflightId: z.string().nullable(),
  reason: z.enum(preflightRejections),
  message: z.string(),
});

async function free<T>(
  fetch: CliFetch,
  url: string,
  method: "GET" | "POST",
  schema: z.ZodType<T>,
  body?: unknown,
): Promise<Free<T>> {
  const answer = await callApi(fetch, url, method, body);
  if (answer.kind === "unreachable") {
    return { kind: "unavailable", message: answer.message };
  }
  if (answer.status >= 200 && answer.status < 300) {
    const parsed = schema.safeParse(answer.body);
    return parsed.success
      ? { kind: "ok", value: parsed.data }
      : { kind: "unavailable", message: `${url} answered an unexpected shape` };
  }
  const message = `HTTP ${String(answer.status)} ${errorText(answer.body)}`;
  return answer.status >= 500 ? { kind: "unavailable", message } : { kind: "refused", message };
}

export function createAuthorization(
  fetch: CliFetch,
  api: string,
  body: CreateAuthorizationBody,
): Promise<Free<AuthorizationChallengeView>> {
  return free(fetch, `${api}/v1/authorizations`, "POST", challengeSchema, body);
}

export function verifyAuthorization(
  fetch: CliFetch,
  api: string,
  authorizationId: string,
): Promise<Free<AuthorizationView>> {
  const url = `${api}/v1/authorizations/${encodeURIComponent(authorizationId)}/verify`;
  return free(fetch, url, "POST", authorizationSchema, {});
}

export function readAuthorization(
  fetch: CliFetch,
  api: string,
  authorizationId: string,
): Promise<Free<AuthorizationView>> {
  const url = `${api}/v1/authorizations/${encodeURIComponent(authorizationId)}`;
  return free(fetch, url, "GET", authorizationSchema);
}

export type PreflightAnswer =
  | { readonly kind: "eligible"; readonly preflight: PreflightEligible }
  | { readonly kind: "ineligible"; readonly preflight: PreflightIneligible }
  | { readonly kind: "refused"; readonly message: string }
  | { readonly kind: "unavailable"; readonly message: string };

export async function requestPreflight(
  fetch: CliFetch,
  api: string,
  body: PreflightBody,
): Promise<PreflightAnswer> {
  const answer = await callApi(fetch, `${api}/v1/preflight`, "POST", body);
  if (answer.kind === "unreachable") {
    return { kind: "unavailable", message: answer.message };
  }
  const eligible = eligibleSchema.safeParse(answer.body);
  if (answer.status === 201 && eligible.success) {
    return { kind: "eligible", preflight: eligible.data };
  }
  const ineligible = ineligibleSchema.safeParse(answer.body);
  if (answer.status < 500 && ineligible.success) {
    return { kind: "ineligible", preflight: ineligible.data };
  }
  const message = `HTTP ${String(answer.status)} ${errorText(answer.body)}`;
  return answer.status >= 400 && answer.status < 500
    ? { kind: "refused", message }
    : { kind: "unavailable", message };
}
