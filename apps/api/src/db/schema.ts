import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import {
  authorizationStatuses,
  authorizationTypes,
  checkIds,
  httpMethods,
  inconclusiveReasons,
  jobStatuses,
  paymentStatuses,
  preflightRejections,
  profiles,
  scenarioStatuses,
  verdicts,
} from "@selo/core";

export const httpMethod = pgEnum("http_method", httpMethods);
export const authorizationStatus = pgEnum("authorization_status", authorizationStatuses);
export const authorizationType = pgEnum("authorization_type", authorizationTypes);
export const preflightRejection = pgEnum("preflight_rejection", preflightRejections);
export const profile = pgEnum("profile", profiles);
export const jobStatus = pgEnum("job_status", jobStatuses);
export const verdict = pgEnum("verdict", verdicts);
export const inconclusiveReason = pgEnum("inconclusive_reason", inconclusiveReasons);
export const checkId = pgEnum("check_id", checkIds);
export const scenarioStatus = pgEnum("scenario_status", scenarioStatuses);
export const paymentStatus = pgEnum("payment_status", paymentStatuses);

const micros = (name: string) => bigint(name, { mode: "number" });
const at = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => at("created_at").notNull().defaultNow();

export const targetAuthorizations = pgTable(
  "target_authorizations",
  {
    id: text("id").primaryKey(),
    origin: text("origin").notNull(),
    routePath: text("route_path").notNull(),
    httpMethod: httpMethod("http_method").notNull(),
    authorizationType: authorizationType("authorization_type").notNull(),
    verificationNonceHash: text("verification_nonce_hash"),
    consentNote: text("consent_note"),
    project: text("project").notNull(),
    contact: text("contact").notNull(),
    status: authorizationStatus("status").notNull().default("PENDING"),
    verifiedAt: at("verified_at"),
    expiresAt: at("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    index("target_authorizations_target_idx").on(table.origin, table.routePath, table.httpMethod),
  ],
);

export const preflights = pgTable(
  "preflights",
  {
    id: text("id").primaryKey(),
    authorizationId: text("authorization_id")
      .notNull()
      .references(() => targetAuthorizations.id),
    targetUrl: text("target_url").notNull(),
    httpMethod: httpMethod("http_method").notNull(),
    paymentNetwork: text("payment_network"),
    paymentAsset: text("payment_asset"),
    paymentAmountMicros: micros("payment_amount_micros"),
    payTo: text("pay_to"),
    paymentRequirementsHash: text("payment_requirements_hash"),
    paymentRequirementsJson: jsonb("payment_requirements_json"),
    requestBodyJson: jsonb("request_body_json"),
    discoveryHash: text("discovery_hash"),
    discoveryJson: jsonb("discovery_json"),
    eligible: boolean("eligible").notNull(),
    rejectionReason: preflightRejection("rejection_reason"),
    expiresAt: at("expires_at").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    check(
      "preflights_eligible_complete",
      sql`not ${table.eligible} or (${table.paymentAmountMicros} is not null and ${table.paymentNetwork} is not null and ${table.paymentAsset} is not null and ${table.payTo} is not null and ${table.paymentRequirementsHash} is not null)`,
    ),
  ],
);

export const releaseJobs = pgTable(
  "release_jobs",
  {
    id: text("id").primaryKey(),
    preflightId: text("preflight_id")
      .notNull()
      .references(() => preflights.id),
    profile: profile("profile").notNull(),
    status: jobStatus("status").notNull().default("READY"),
    verdict: verdict("verdict"),
    inconclusiveReason: inconclusiveReason("inconclusive_reason"),
    idempotencyKey: text("idempotency_key").notNull(),
    payer: text("payer"),
    incomingTxId: text("incoming_tx_id"),
    incomingAmountMicros: micros("incoming_amount_micros"),
    incomingSettledAt: at("incoming_settled_at"),
    maxSpendMicros: micros("max_spend_micros").notNull(),
    reservedSpendMicros: micros("reserved_spend_micros").notNull().default(0),
    settledSpendMicros: micros("settled_spend_micros").notNull().default(0),
    unresolvedSpendMicros: micros("unresolved_spend_micros").notNull().default(0),
    expectedJson: jsonb("expected_json"),
    reportTokenHash: text("report_token_hash"),
    gitSha: text("git_sha"),
    startedAt: at("started_at"),
    completedAt: at("completed_at"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("release_jobs_idempotency_key_unique").on(table.idempotencyKey),
    uniqueIndex("release_jobs_incoming_tx_id_unique").on(table.incomingTxId),
    uniqueIndex("release_jobs_report_token_hash_unique").on(table.reportTokenHash),
    check(
      "release_jobs_budget_invariant",
      sql`${table.settledSpendMicros} + ${table.reservedSpendMicros} + ${table.unresolvedSpendMicros} <= ${table.maxSpendMicros}`,
    ),
    check("release_jobs_absolute_cap", sql`${table.maxSpendMicros} <= 5000000`),
    check(
      "release_jobs_non_negative",
      sql`${table.settledSpendMicros} >= 0 and ${table.reservedSpendMicros} >= 0 and ${table.unresolvedSpendMicros} >= 0 and ${table.maxSpendMicros} > 0`,
    ),
  ],
);

export const scenarios = pgTable(
  "scenarios",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => releaseJobs.id),
    scenarioKey: checkId("scenario_key").notNull(),
    operationId: text("operation_id").notNull(),
    status: scenarioStatus("status").notNull().default("PLANNED"),
    blocking: boolean("blocking").notNull(),
    attemptCount: integer("attempt_count").notNull().default(0),
    expectedJson: jsonb("expected_json").notNull(),
    observedJson: jsonb("observed_json"),
    failureCode: text("failure_code"),
    startedAt: at("started_at"),
    completedAt: at("completed_at"),
    createdAt: createdAt(),
  },
  (table) => [uniqueIndex("scenarios_job_operation_unique").on(table.jobId, table.operationId)],
);

export const downstreamPayments = pgTable(
  "downstream_payments",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => releaseJobs.id),
    scenarioId: text("scenario_id")
      .notNull()
      .references(() => scenarios.id),
    targetOrigin: text("target_origin").notNull(),
    amountMicros: micros("amount_micros").notNull(),
    network: text("network").notNull(),
    assetId: text("asset_id").notNull(),
    payTo: text("pay_to").notNull(),
    txId: text("tx_id"),
    expectedTxId: text("expected_tx_id"),
    paymentRequirementsHash: text("payment_requirements_hash").notNull(),
    status: paymentStatus("status").notNull().default("RESERVED"),
    resolutionReason: text("resolution_reason"),
    requestedAt: at("requested_at"),
    createdAt: createdAt(),
    settledAt: at("settled_at"),
  },
  (table) => [
    index("downstream_payments_job_idx").on(table.jobId),
    uniqueIndex("downstream_payments_tx_unique").on(table.txId),
    check("downstream_payments_positive", sql`${table.amountMicros} > 0`),
  ],
);

export const evidence = pgTable(
  "evidence",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .references(() => releaseJobs.id),
    scenarioId: text("scenario_id").references(() => scenarios.id),
    kind: text("kind").notNull(),
    sha256: text("sha256").notNull(),
    sanitizedJson: jsonb("sanitized_json").notNull(),
    createdAt: createdAt(),
  },
  (table) => [index("evidence_job_idx").on(table.jobId)],
);
