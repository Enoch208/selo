export type DecimalAmount = string;

export type JsonValue =
  string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export const verdicts = ["PASS", "FAIL", "INCONCLUSIVE"] as const;
export type Verdict = (typeof verdicts)[number];

export const profiles = ["quick"] as const;
export type Profile = (typeof profiles)[number];

export const httpMethods = ["GET", "POST"] as const;
export type HttpMethod = (typeof httpMethods)[number];

export const authorizationStatuses = ["PENDING", "VERIFIED", "EXPIRED", "REVOKED"] as const;
export type AuthorizationStatus = (typeof authorizationStatuses)[number];

export const authorizationTypes = ["well_known_file", "manual_owner_consent"] as const;
export type AuthorizationType = (typeof authorizationTypes)[number];

export const jobStatuses = [
  "READY",
  "INBOUND_SETTLED",
  "QUEUED",
  "RUNNING_PREFLIGHT_RECHECK",
  "RUNNING",
  "ANALYZING",
  "PASS",
  "FAIL",
  "INCONCLUSIVE",
  "REPORT_WRITTEN",
] as const;
export type JobStatus = (typeof jobStatuses)[number];

export const scenarioStatuses = [
  "PLANNED",
  "POLICY_CHECKED",
  "RESERVED",
  "REQUESTING",
  "SETTLED",
  "REJECTED",
  "TIMEOUT_UNRESOLVED",
  "EVALUATED",
] as const;
export type ScenarioStatus = (typeof scenarioStatuses)[number];

export const paymentStatuses = ["RESERVED", "SETTLED", "RELEASED", "UNRESOLVED"] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];

export const checkIds = [
  "handshake",
  "paid_delivery",
  "response_contract",
  "discovery_contract",
  "retry_safety",
] as const;
export type CheckId = (typeof checkIds)[number];

export const checkStatuses = ["PASS", "WARN", "FAIL", "INCONCLUSIVE"] as const;
export type CheckStatus = (typeof checkStatuses)[number];

export const retryOutcomes = [
  "PASS_SAFE_RETRY",
  "PASS_REPLAY_REJECTED",
  "WARN_NO_IDEMPOTENCY_CONTRACT",
  "FAIL_DUPLICATE_SIDE_EFFECT",
  "INCONCLUSIVE",
] as const;
export type RetryOutcome = (typeof retryOutcomes)[number];

export const spendDenialReasons = [
  "AUTHORIZATION_INVALID",
  "AUTHORIZATION_EXPIRED",
  "JOB_NOT_RUNNING",
  "ORIGIN_NOT_AUTHORIZED",
  "NETWORK_NOT_ALLOWED",
  "ASSET_NOT_ALLOWED",
  "PAYMENT_UNRESOLVED",
  "SCENARIO_BUDGET_EXCEEDED",
  "JOB_BUDGET_EXCEEDED",
  "ABSOLUTE_CAP_EXCEEDED",
] as const;
export type SpendDenialReason = (typeof spendDenialReasons)[number];

export const inconclusiveReasons = [
  "NETWORK_UNAVAILABLE",
  "FACILITATOR_UNAVAILABLE",
  "TARGET_TIMEOUT",
  "BUDGET_EXHAUSTED",
  "PAYMENT_UNRESOLVED",
  "EVIDENCE_INCOMPLETE",
  "AUTHORIZATION_LAPSED",
  "INTERNAL_ERROR",
] as const;
export type InconclusiveReason = (typeof inconclusiveReasons)[number];

export const preflightRejections = [
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
] as const;
export type PreflightRejection = (typeof preflightRejections)[number];

export interface CheckResult {
  readonly id: CheckId;
  readonly status: CheckStatus;
  readonly code: string;
  readonly blocking: boolean;
  readonly summary: string;
  readonly evidence: readonly string[];
}

export interface ApiError {
  readonly error: string;
  readonly message: string;
}

export interface CreateAuthorizationBody {
  readonly targetUrl: string;
  readonly method: HttpMethod;
  readonly project: string;
  readonly contact: string;
}

export interface AuthorizationChallengeView {
  readonly authorizationId: string;
  readonly status: AuthorizationStatus;
  readonly origin: string;
  readonly routePath: string;
  readonly method: HttpMethod;
  readonly verificationUrl: string;
  readonly expectedContent: string;
}

export interface AuthorizationView {
  readonly authorizationId: string;
  readonly status: AuthorizationStatus;
  readonly origin: string;
  readonly routePath: string;
  readonly method: HttpMethod;
  readonly type: AuthorizationType;
  readonly verifiedAt: string | null;
  readonly expiresAt: string | null;
}

export interface PreflightBody {
  readonly authorizationId: string;
  readonly targetUrl: string;
  readonly method: HttpMethod;
  readonly requestBody?: JsonValue;
}

export interface PreflightEligible {
  readonly eligible: true;
  readonly preflightId: string;
  readonly target: {
    readonly url: string;
    readonly method: HttpMethod;
    readonly priceUsdc: DecimalAmount;
  };
  readonly estimatedMaxSpendUsdc: DecimalAmount;
  readonly seloPriceUsdc: DecimalAmount;
  readonly expiresAt: string;
}

export interface PreflightIneligible {
  readonly eligible: false;
  readonly preflightId: string | null;
  readonly reason: PreflightRejection;
  readonly message: string;
}

export type PreflightResponse = PreflightEligible | PreflightIneligible;

export interface ExpectedContract {
  readonly status?: number;
  readonly contentType?: string;
  readonly jsonSchema?: Record<string, unknown>;
}

export interface ReleaseTestBody {
  readonly preflightId: string;
  readonly profile: Profile;
  readonly expected?: ExpectedContract;
}

export interface ReleaseTestResponse {
  readonly jobId: string;
  readonly verdict: Verdict;
  readonly target: string;
  readonly checks: readonly CheckResult[];
  readonly warnings: readonly string[];
  readonly inconclusiveReason: InconclusiveReason | null;
  readonly money: {
    readonly seloInboundTxId: string;
    readonly downstreamSpendUsdc: DecimalAmount;
    readonly downstreamTxIds: readonly string[];
  };
  readonly reportUrl: string;
}

export interface ReportScenario {
  readonly check: CheckId;
  readonly operationId: string;
  readonly status: ScenarioStatus;
  readonly attempts: number;
  readonly durationMs: number | null;
  readonly failureCode: string | null;
}

export interface ReportPayment {
  readonly status: PaymentStatus;
  readonly amountUsdc: DecimalAmount;
  readonly txId: string | null;
  readonly expectedTxId: string | null;
}

export interface ReportObservedResponse {
  readonly status: number;
  readonly contentType: string | null;
  readonly bodySha256: string | null;
  readonly bodyBytes: number | null;
  readonly txId: string | null;
  readonly requestedAt: string | null;
}

export interface ReleaseReport {
  readonly jobId: string;
  readonly project: string;
  readonly target: { readonly url: string; readonly method: HttpMethod };
  readonly testedAt: string | null;
  readonly completedAt: string | null;
  readonly seloVersion: string;
  readonly verdict: Verdict | null;
  readonly inconclusiveReason: InconclusiveReason | null;
  readonly checks: readonly CheckResult[];
  readonly warnings: readonly string[];
  readonly failureCodes: readonly string[];
  readonly targetChallengeSha256: string | null;
  readonly expected: ExpectedContract | null;
  readonly observedResponse: ReportObservedResponse | null;
  readonly money: {
    readonly inboundTxId: string | null;
    readonly downstreamSpendUsdc: DecimalAmount;
    readonly unresolvedSpendUsdc: DecimalAmount;
    readonly downstreamTxIds: readonly string[];
    readonly payments: readonly ReportPayment[];
  };
  readonly scenarios: readonly ReportScenario[];
}
