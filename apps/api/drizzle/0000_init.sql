CREATE TYPE "public"."authorization_status" AS ENUM('PENDING', 'VERIFIED', 'EXPIRED', 'REVOKED');--> statement-breakpoint
CREATE TYPE "public"."authorization_type" AS ENUM('well_known_file', 'manual_owner_consent');--> statement-breakpoint
CREATE TYPE "public"."check_id" AS ENUM('handshake', 'paid_delivery', 'response_contract', 'discovery_contract', 'retry_safety');--> statement-breakpoint
CREATE TYPE "public"."http_method" AS ENUM('GET', 'POST');--> statement-breakpoint
CREATE TYPE "public"."inconclusive_reason" AS ENUM('NETWORK_UNAVAILABLE', 'FACILITATOR_UNAVAILABLE', 'TARGET_TIMEOUT', 'BUDGET_EXHAUSTED', 'PAYMENT_UNRESOLVED', 'EVIDENCE_INCOMPLETE', 'AUTHORIZATION_LAPSED', 'INTERNAL_ERROR');--> statement-breakpoint
CREATE TYPE "public"."job_status" AS ENUM('READY', 'INBOUND_SETTLED', 'QUEUED', 'RUNNING_PREFLIGHT_RECHECK', 'RUNNING', 'ANALYZING', 'PASS', 'FAIL', 'INCONCLUSIVE', 'REPORT_WRITTEN');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('RESERVED', 'SETTLED', 'RELEASED', 'UNRESOLVED');--> statement-breakpoint
CREATE TYPE "public"."preflight_rejection" AS ENUM('AUTHORIZATION_MISSING', 'AUTHORIZATION_EXPIRED', 'TARGET_URL_INVALID', 'TARGET_NOT_HTTPS', 'TARGET_ADDRESS_BLOCKED', 'METHOD_NOT_ALLOWED', 'TARGET_UNREACHABLE', 'NO_PAYMENT_CHALLENGE', 'NETWORK_NOT_SUPPORTED', 'ASSET_NOT_SUPPORTED', 'PRICE_OVER_BUDGET');--> statement-breakpoint
CREATE TYPE "public"."profile" AS ENUM('quick');--> statement-breakpoint
CREATE TYPE "public"."scenario_status" AS ENUM('PLANNED', 'POLICY_CHECKED', 'RESERVED', 'REQUESTING', 'SETTLED', 'REJECTED', 'TIMEOUT_UNRESOLVED', 'EVALUATED');--> statement-breakpoint
CREATE TYPE "public"."verdict" AS ENUM('PASS', 'FAIL', 'INCONCLUSIVE');--> statement-breakpoint
CREATE TABLE "downstream_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"scenario_id" text NOT NULL,
	"target_origin" text NOT NULL,
	"amount_micros" bigint NOT NULL,
	"network" text NOT NULL,
	"asset_id" text NOT NULL,
	"pay_to" text NOT NULL,
	"tx_id" text,
	"expected_tx_id" text,
	"payment_requirements_hash" text NOT NULL,
	"status" "payment_status" DEFAULT 'RESERVED' NOT NULL,
	"resolution_reason" text,
	"requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	CONSTRAINT "downstream_payments_positive" CHECK ("downstream_payments"."amount_micros" > 0)
);
--> statement-breakpoint
CREATE TABLE "evidence" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"scenario_id" text,
	"kind" text NOT NULL,
	"sha256" text NOT NULL,
	"sanitized_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "preflights" (
	"id" text PRIMARY KEY NOT NULL,
	"authorization_id" text NOT NULL,
	"target_url" text NOT NULL,
	"http_method" "http_method" NOT NULL,
	"payment_network" text,
	"payment_asset" text,
	"payment_amount_micros" bigint,
	"pay_to" text,
	"payment_requirements_hash" text,
	"payment_requirements_json" jsonb,
	"request_body_json" jsonb,
	"discovery_hash" text,
	"discovery_json" jsonb,
	"eligible" boolean NOT NULL,
	"rejection_reason" "preflight_rejection",
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "preflights_eligible_complete" CHECK (not "preflights"."eligible" or ("preflights"."payment_amount_micros" is not null and "preflights"."payment_network" is not null and "preflights"."payment_asset" is not null and "preflights"."pay_to" is not null and "preflights"."payment_requirements_hash" is not null))
);
--> statement-breakpoint
CREATE TABLE "release_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"preflight_id" text NOT NULL,
	"profile" "profile" NOT NULL,
	"status" "job_status" DEFAULT 'READY' NOT NULL,
	"verdict" "verdict",
	"inconclusive_reason" "inconclusive_reason",
	"idempotency_key" text NOT NULL,
	"payer" text,
	"incoming_tx_id" text,
	"incoming_amount_micros" bigint,
	"incoming_settled_at" timestamp with time zone,
	"max_spend_micros" bigint NOT NULL,
	"reserved_spend_micros" bigint DEFAULT 0 NOT NULL,
	"settled_spend_micros" bigint DEFAULT 0 NOT NULL,
	"unresolved_spend_micros" bigint DEFAULT 0 NOT NULL,
	"expected_json" jsonb,
	"report_token_hash" text,
	"git_sha" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "release_jobs_budget_invariant" CHECK ("release_jobs"."settled_spend_micros" + "release_jobs"."reserved_spend_micros" + "release_jobs"."unresolved_spend_micros" <= "release_jobs"."max_spend_micros"),
	CONSTRAINT "release_jobs_absolute_cap" CHECK ("release_jobs"."max_spend_micros" <= 5000000),
	CONSTRAINT "release_jobs_non_negative" CHECK ("release_jobs"."settled_spend_micros" >= 0 and "release_jobs"."reserved_spend_micros" >= 0 and "release_jobs"."unresolved_spend_micros" >= 0 and "release_jobs"."max_spend_micros" > 0)
);
--> statement-breakpoint
CREATE TABLE "scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"scenario_key" "check_id" NOT NULL,
	"operation_id" text NOT NULL,
	"status" "scenario_status" DEFAULT 'PLANNED' NOT NULL,
	"blocking" boolean NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"expected_json" jsonb NOT NULL,
	"observed_json" jsonb,
	"failure_code" text,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "target_authorizations" (
	"id" text PRIMARY KEY NOT NULL,
	"origin" text NOT NULL,
	"route_path" text NOT NULL,
	"http_method" "http_method" NOT NULL,
	"authorization_type" "authorization_type" NOT NULL,
	"verification_nonce_hash" text,
	"consent_note" text,
	"project" text NOT NULL,
	"contact" text NOT NULL,
	"status" "authorization_status" DEFAULT 'PENDING' NOT NULL,
	"verified_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "downstream_payments" ADD CONSTRAINT "downstream_payments_job_id_release_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."release_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "downstream_payments" ADD CONSTRAINT "downstream_payments_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_job_id_release_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."release_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_scenario_id_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."scenarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preflights" ADD CONSTRAINT "preflights_authorization_id_target_authorizations_id_fk" FOREIGN KEY ("authorization_id") REFERENCES "public"."target_authorizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_jobs" ADD CONSTRAINT "release_jobs_preflight_id_preflights_id_fk" FOREIGN KEY ("preflight_id") REFERENCES "public"."preflights"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_job_id_release_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."release_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "downstream_payments_job_idx" ON "downstream_payments" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "downstream_payments_tx_unique" ON "downstream_payments" USING btree ("tx_id");--> statement-breakpoint
CREATE INDEX "evidence_job_idx" ON "evidence" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "release_jobs_idempotency_key_unique" ON "release_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "release_jobs_incoming_tx_id_unique" ON "release_jobs" USING btree ("incoming_tx_id");--> statement-breakpoint
CREATE UNIQUE INDEX "release_jobs_report_token_hash_unique" ON "release_jobs" USING btree ("report_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "scenarios_job_operation_unique" ON "scenarios" USING btree ("job_id","operation_id");--> statement-breakpoint
CREATE INDEX "target_authorizations_target_idx" ON "target_authorizations" USING btree ("origin","route_path","http_method");