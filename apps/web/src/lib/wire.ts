import type {
  ApiError,
  AuthorizationChallengeView,
  AuthorizationView,
  CheckResult,
  PreflightResponse,
  ReleaseReport,
} from "@selo/core";
import { z } from "zod";

const method = z.enum(["GET", "POST"]);
const decimal = z.string().regex(/^\d+(\.\d+)?$/);

export const apiErrorSchema = z.object({
  error: z.string(),
  message: z.string(),
}) satisfies z.ZodType<ApiError>;

export const healthSchema = z.object({ status: z.literal("ok") });

const authorizationStatus = z.enum(["PENDING", "VERIFIED", "EXPIRED", "REVOKED"]);

export const challengeSchema = z.object({
  authorizationId: z.string(),
  status: authorizationStatus,
  origin: z.string(),
  routePath: z.string(),
  method,
  verificationUrl: z.string(),
  expectedContent: z.string(),
}) satisfies z.ZodType<AuthorizationChallengeView>;

export const authorizationSchema = z.object({
  authorizationId: z.string(),
  status: authorizationStatus,
  origin: z.string(),
  routePath: z.string(),
  method,
  type: z.enum(["well_known_file", "manual_owner_consent"]),
  verifiedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
}) satisfies z.ZodType<AuthorizationView>;

export const preflightSchema = z.discriminatedUnion("eligible", [
  z.object({
    eligible: z.literal(true),
    preflightId: z.string(),
    target: z.object({ url: z.string(), method, priceUsdc: decimal }),
    estimatedMaxSpendUsdc: decimal,
    seloPriceUsdc: decimal,
    expiresAt: z.string(),
  }),
  z.object({
    eligible: z.literal(false),
    preflightId: z.string().nullable(),
    reason: z.enum([
      "AUTHORIZATION_MISSING",
      "AUTHORIZATION_EXPIRED",
      "TARGET_URL_INVALID",
      "TARGET_NOT_HTTPS",
      "TARGET_ADDRESS_BLOCKED",
      "METHOD_NOT_ALLOWED",
      "TARGET_UNREACHABLE",
      "NO_PAYMENT_CHALLENGE",
      "NETWORK_NOT_SUPPORTED",
      "ASSET_NOT_SUPPORTED",
      "PRICE_OVER_BUDGET",
    ]),
    message: z.string(),
  }),
]) satisfies z.ZodType<PreflightResponse>;

const checkSchema = z.object({
  id: z.enum([
    "handshake",
    "paid_delivery",
    "response_contract",
    "discovery_contract",
    "retry_safety",
  ]),
  status: z.enum(["PASS", "WARN", "FAIL", "INCONCLUSIVE"]),
  code: z.string(),
  blocking: z.boolean(),
  summary: z.string(),
  evidence: z.array(z.string()),
}) satisfies z.ZodType<CheckResult>;

const verdict = z.enum(["PASS", "FAIL", "INCONCLUSIVE"]);

export type ReportView = Pick<
  ReleaseReport,
  | "jobId"
  | "project"
  | "target"
  | "testedAt"
  | "completedAt"
  | "seloVersion"
  | "verdict"
  | "inconclusiveReason"
  | "checks"
  | "warnings"
> & {
  readonly money: Pick<
    ReleaseReport["money"],
    "inboundTxId" | "downstreamSpendUsdc" | "unresolvedSpendUsdc" | "downstreamTxIds"
  >;
};

export const reportSchema = z.object({
  jobId: z.string(),
  project: z.string(),
  target: z.object({ url: z.string(), method }),
  testedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  seloVersion: z.string(),
  verdict: verdict.nullable(),
  inconclusiveReason: z
    .enum([
      "NETWORK_UNAVAILABLE",
      "FACILITATOR_UNAVAILABLE",
      "TARGET_TIMEOUT",
      "BUDGET_EXHAUSTED",
      "PAYMENT_UNRESOLVED",
      "EVIDENCE_INCOMPLETE",
      "AUTHORIZATION_LAPSED",
      "INTERNAL_ERROR",
    ])
    .nullable(),
  checks: z.array(checkSchema),
  warnings: z.array(z.string()),
  money: z.object({
    inboundTxId: z.string().nullable(),
    downstreamSpendUsdc: decimal,
    unresolvedSpendUsdc: decimal,
    downstreamTxIds: z.array(z.string()),
  }),
}) satisfies z.ZodType<ReportView>;
