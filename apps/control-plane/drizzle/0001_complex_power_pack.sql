-- P0 has no historical control-plane telemetry to preserve. Refuse an
-- in-place upgrade of a populated pre-persistence database rather than invent
-- health scores, enforcement values, or idempotency keys for old records.
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM "repositories")
		OR EXISTS (SELECT 1 FROM "tenets")
		OR EXISTS (SELECT 1 FROM "validation_runs")
		OR EXISTS (SELECT 1 FROM "violations")
		OR EXISTS (SELECT 1 FROM "health_snapshots") THEN
		RAISE EXCEPTION 'Tenet P0 persistence migration requires an empty database. Use a fresh PostgreSQL database or migrate legacy telemetry explicitly.';
	END IF;
END $$;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pgcrypto;--> statement-breakpoint
CREATE TABLE "validation_run_violations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"validation_run_id" uuid NOT NULL,
	"violation_id" uuid NOT NULL,
	"status" "violation_status" NOT NULL,
	"affected_files" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"details" jsonb NOT NULL,
	"health_impact" jsonb NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "health_snapshots_repository_created_index";--> statement-breakpoint
DROP INDEX "violations_fingerprint_index";--> statement-breakpoint
ALTER TABLE "validation_runs" ALTER COLUMN "head_sha" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "health_snapshots" ADD COLUMN "validated_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "repositories" ADD COLUMN "display_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "tenets" ADD COLUMN "external_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD COLUMN "ingestion_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD COLUMN "source" text DEFAULT 'cli' NOT NULL;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD COLUMN "branch" text;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD COLUMN "author" text;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD COLUMN "commit_message" text;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD COLUMN "warning_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD COLUMN "warnings" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD COLUMN "architecture_score" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD COLUMN "intent_score" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD COLUMN "validated_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "violations" ADD COLUMN "enforcement" "enforcement" NOT NULL;--> statement-breakpoint
ALTER TABLE "violations" ADD COLUMN "details" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "violations" ADD COLUMN "health_impact" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "validation_run_violations" ADD CONSTRAINT "validation_run_violations_validation_run_id_validation_runs_id_fk" FOREIGN KEY ("validation_run_id") REFERENCES "public"."validation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_run_violations" ADD CONSTRAINT "validation_run_violations_violation_id_violations_id_fk" FOREIGN KEY ("violation_id") REFERENCES "public"."violations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "validation_run_violations_run_violation_unique" ON "validation_run_violations" USING btree ("validation_run_id","violation_id");--> statement-breakpoint
CREATE INDEX "validation_run_violations_violation_index" ON "validation_run_violations" USING btree ("violation_id");--> statement-breakpoint
CREATE INDEX "health_snapshots_repository_validated_index" ON "health_snapshots" USING btree ("repository_id","validated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "health_snapshots_validation_run_unique" ON "health_snapshots" USING btree ("validation_run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenet_evaluations_run_tenet_unique" ON "tenet_evaluations" USING btree ("validation_run_id","tenet_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenets_repository_external_id_unique" ON "tenets" USING btree ("repository_id","external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "validation_runs_repository_ingestion_key_unique" ON "validation_runs" USING btree ("repository_id","ingestion_key");--> statement-breakpoint
CREATE UNIQUE INDEX "violations_repository_fingerprint_unique" ON "violations" USING btree ("repository_id","fingerprint");
