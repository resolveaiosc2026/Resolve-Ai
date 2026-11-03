CREATE TYPE "public"."activation_status" AS ENUM('success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."bundle_validity" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."classification_source" AS ENUM('evidence', 'feedback', 'human');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('USD', 'LRD');--> statement-breakpoint
CREATE TYPE "public"."fault_source" AS ENUM('customer_report', 'network_monitoring');--> statement-breakpoint
CREATE TYPE "public"."feedback_request_status" AS ENUM('pending', 'handed_off', 'responded', 'no_response');--> statement-breakpoint
CREATE TYPE "public"."feedback_trigger" AS ENUM('no_evidence', 'low_confidence');--> statement-breakpoint
CREATE TYPE "public"."intervention_status" AS ENUM('approved', 'handed_off', 'delivered', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."metric_period" AS ENUM('baseline', 'current', 'post_intervention');--> statement-breakpoint
CREATE TYPE "public"."outcome_cohort" AS ENUM('treated', 'control');--> statement-breakpoint
CREATE TYPE "public"."outcome_type" AS ENUM('re_engaged', 'partially_engaged', 'no_change', 'declined_further');--> statement-breakpoint
CREATE TYPE "public"."priority_band" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TYPE "public"."queue_status" AS ENUM('new', 'awaiting_reply', 'unclassified', 'ready', 'action_done', 'closed');--> statement-breakpoint
CREATE TYPE "public"."recommendation_status" AS ENUM('pending', 'approved', 'rejected', 'superseded');--> statement-breakpoint
CREATE TYPE "public"."sentiment" AS ENUM('negative', 'neutral', 'positive');--> statement-breakpoint
CREATE TYPE "public"."value_tier" AS ENUM('high', 'medium', 'low');--> statement-breakpoint
CREATE TABLE "action_reasons" (
	"action_id" text NOT NULL,
	"reason_id" text NOT NULL,
	CONSTRAINT "action_reasons_action_id_reason_id_pk" PRIMARY KEY("action_id","reason_id")
);
--> statement-breakpoint
CREATE TABLE "actions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"short_name" text NOT NULL,
	"price" numeric(10, 2) DEFAULT 0 NOT NULL,
	"currency" "currency" DEFAULT 'USD' NOT NULL,
	"size_mb" integer DEFAULT 0 NOT NULL,
	"validity_hours" integer DEFAULT 0 NOT NULL,
	"channel" text NOT NULL,
	"delivery_window" text NOT NULL,
	"message_body" text NOT NULL,
	"mismatch_note" text DEFAULT '' NOT NULL,
	"eligibility_rules" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bundles" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"validity" "bundle_validity" NOT NULL,
	"data_mb" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_history" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "campaign_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"reason_id" text NOT NULL,
	"action_id" text NOT NULL,
	"recovery_rate" numeric(4, 3) NOT NULL,
	"sample_size" integer NOT NULL,
	"simulated" boolean DEFAULT true NOT NULL,
	CONSTRAINT "campaign_history_reasonId_actionId_unique" UNIQUE("reason_id","action_id")
);
--> statement-breakpoint
CREATE TABLE "reasons" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"icon" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bundle_activations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" text NOT NULL,
	"bundle_id" text NOT NULL,
	"data_mb" integer NOT NULL,
	"price_paid" numeric(10, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"activation_channel" text NOT NULL,
	"status" "activation_status" NOT NULL,
	"activated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" text PRIMARY KEY NOT NULL,
	"segment" text NOT NULL,
	"region" text NOT NULL,
	"value_tier" "value_tier" NOT NULL,
	"tenure_months" integer NOT NULL,
	"masked_msisdn" text NOT NULL,
	"scenario" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_faults" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" text,
	"region" text NOT NULL,
	"source" "fault_source" NOT NULL,
	"reported_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" text NOT NULL,
	"run_id" text NOT NULL,
	"flagged_at" timestamp with time zone NOT NULL,
	"change_pct" integer NOT NULL,
	"priority_score" integer NOT NULL,
	"priority_band" "priority_band" NOT NULL,
	"contributions" jsonb NOT NULL,
	"model_version" text DEFAULT 'rules-v1' NOT NULL,
	"queue_status" "queue_status" DEFAULT 'new' NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "customer_metrics" (
	"run_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"period" "metric_period" NOT NULL,
	"activations" integer NOT NULL,
	"data_gb" numeric(8, 2) NOT NULL,
	"spend_usd" numeric(12, 2) DEFAULT 0 NOT NULL,
	"spend_lrd" numeric(14, 2) DEFAULT 0 NOT NULL,
	"spend_usd_equivalent" numeric(12, 2) DEFAULT 0 NOT NULL,
	"active_days" integer NOT NULL,
	"failed_activation_rate" numeric(4, 3) DEFAULT 0 NOT NULL,
	"days_since_last_activity" integer NOT NULL,
	"care_contacts_30d" integer DEFAULT 0 NOT NULL,
	"network_fault_reports_30d" integer DEFAULT 0 NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_metrics_run_id_customer_id_period_pk" PRIMARY KEY("run_id","customer_id","period")
);
--> statement-breakpoint
CREATE TABLE "detection_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"run_at" timestamp with time zone NOT NULL,
	"baseline_weeks" integer DEFAULT 8 NOT NULL,
	"current_weeks" integer DEFAULT 4 NOT NULL,
	"model_version" text DEFAULT 'rules-v1' NOT NULL,
	"population_summary" jsonb,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "customer_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" text,
	"case_id" uuid,
	"feedback_request_id" uuid,
	"channel" text NOT NULL,
	"region" text,
	"raw_text" text NOT NULL,
	"simulated" boolean DEFAULT true NOT NULL,
	"received_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "feedback_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"channel" text NOT NULL,
	"question" text NOT NULL,
	"trigger_reason" "feedback_trigger" NOT NULL,
	"status" "feedback_request_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handed_off_at" timestamp with time zone,
	"responded_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "reason_classifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"feedback_id" uuid,
	"reason_id" text NOT NULL,
	"confidence" numeric(4, 3) NOT NULL,
	"alternatives" jsonb NOT NULL,
	"sentiment" "sentiment",
	"summary" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"source" "classification_source" NOT NULL,
	"classified_by" text NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"reviewed_reason_id" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interventions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"recommendation_id" uuid NOT NULL,
	"case_id" uuid NOT NULL,
	"action_id" text NOT NULL,
	"channel" text NOT NULL,
	"approved_by" text NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"status" "intervention_status" DEFAULT 'approved' NOT NULL,
	"handed_off_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"click_recorded" boolean DEFAULT false NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "interventions_reference_unique" UNIQUE("reference"),
	CONSTRAINT "interventions_recommendationId_unique" UNIQUE("recommendation_id")
);
--> statement-breakpoint
CREATE TABLE "outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cohort" "outcome_cohort" NOT NULL,
	"reference" text,
	"case_id" uuid NOT NULL,
	"intervention_id" uuid,
	"window_days" integer NOT NULL,
	"baseline_activations" integer NOT NULL,
	"activations_after" integer NOT NULL,
	"change_pct" integer NOT NULL,
	"outcome_type" "outcome_type" NOT NULL,
	"recovered" boolean NOT NULL,
	"tolerance_pct" integer DEFAULT 5 NOT NULL,
	"note" text,
	"simulated" boolean DEFAULT true NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	CONSTRAINT "outcomes_reference_unique" UNIQUE("reference"),
	CONSTRAINT "outcomes_interventionId_unique" UNIQUE("intervention_id")
);
--> statement-breakpoint
CREATE TABLE "recommendations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" uuid NOT NULL,
	"classification_id" uuid,
	"action_id" text NOT NULL,
	"predicted_recovery" numeric(4, 3) NOT NULL,
	"rationale" text NOT NULL,
	"objective" text NOT NULL,
	"eligibility_checks" jsonb NOT NULL,
	"alternatives" jsonb NOT NULL,
	"status" "recommendation_status" DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "action_reasons" ADD CONSTRAINT "action_reasons_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_reasons" ADD CONSTRAINT "action_reasons_reason_id_reasons_id_fk" FOREIGN KEY ("reason_id") REFERENCES "public"."reasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_history" ADD CONSTRAINT "campaign_history_reason_id_reasons_id_fk" FOREIGN KEY ("reason_id") REFERENCES "public"."reasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_history" ADD CONSTRAINT "campaign_history_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_activations" ADD CONSTRAINT "bundle_activations_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bundle_activations" ADD CONSTRAINT "bundle_activations_bundle_id_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."bundles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_faults" ADD CONSTRAINT "network_faults_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cases" ADD CONSTRAINT "cases_run_id_detection_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."detection_runs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_metrics" ADD CONSTRAINT "customer_metrics_run_id_detection_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."detection_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_metrics" ADD CONSTRAINT "customer_metrics_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_feedback" ADD CONSTRAINT "customer_feedback_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_feedback" ADD CONSTRAINT "customer_feedback_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_feedback" ADD CONSTRAINT "customer_feedback_feedback_request_id_feedback_requests_id_fk" FOREIGN KEY ("feedback_request_id") REFERENCES "public"."feedback_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_requests" ADD CONSTRAINT "feedback_requests_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reason_classifications" ADD CONSTRAINT "reason_classifications_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reason_classifications" ADD CONSTRAINT "reason_classifications_feedback_id_customer_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."customer_feedback"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reason_classifications" ADD CONSTRAINT "reason_classifications_reason_id_reasons_id_fk" FOREIGN KEY ("reason_id") REFERENCES "public"."reasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reason_classifications" ADD CONSTRAINT "reason_classifications_reviewed_reason_id_reasons_id_fk" FOREIGN KEY ("reviewed_reason_id") REFERENCES "public"."reasons"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_recommendation_id_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."recommendations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interventions" ADD CONSTRAINT "interventions_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outcomes" ADD CONSTRAINT "outcomes_intervention_id_interventions_id_fk" FOREIGN KEY ("intervention_id") REFERENCES "public"."interventions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_classification_id_reason_classifications_id_fk" FOREIGN KEY ("classification_id") REFERENCES "public"."reason_classifications"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recommendations" ADD CONSTRAINT "recommendations_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bundle_activations_customer_time_idx" ON "bundle_activations" USING btree ("customer_id","activated_at");--> statement-breakpoint
CREATE INDEX "network_faults_region_time_idx" ON "network_faults" USING btree ("region","reported_at");--> statement-breakpoint
CREATE INDEX "network_faults_customer_idx" ON "network_faults" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "cases_queue_priority_idx" ON "cases" USING btree ("queue_status","priority_score");--> statement-breakpoint
CREATE INDEX "cases_customer_idx" ON "cases" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "customer_feedback_case_idx" ON "customer_feedback" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "customer_feedback_customer_idx" ON "customer_feedback" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "feedback_requests_case_idx" ON "feedback_requests" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "reason_classifications_case_idx" ON "reason_classifications" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "interventions_case_idx" ON "interventions" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "outcomes_cohort_idx" ON "outcomes" USING btree ("cohort");--> statement-breakpoint
CREATE INDEX "recommendations_case_idx" ON "recommendations" USING btree ("case_id");--> statement-breakpoint
CREATE INDEX "recommendations_status_idx" ON "recommendations" USING btree ("status");