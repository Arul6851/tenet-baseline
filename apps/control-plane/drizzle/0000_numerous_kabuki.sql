CREATE TYPE "public"."compliance_status" AS ENUM('satisfied', 'at_risk', 'violated');--> statement-breakpoint
CREATE TYPE "public"."enforcement" AS ENUM('report', 'warn', 'block_merge');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."tenet_status" AS ENUM('draft', 'active', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."tenet_type" AS ENUM('architecture', 'business');--> statement-breakpoint
CREATE TYPE "public"."validation_status" AS ENUM('PASS', 'WARN', 'BLOCK');--> statement-breakpoint
CREATE TYPE "public"."violation_status" AS ENUM('active', 'resolved', 'blocked');--> statement-breakpoint
CREATE TABLE "architecture_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"source_node_id" uuid NOT NULL,
	"target_node_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "architecture_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"node_key" text NOT NULL,
	"label" text NOT NULL,
	"path_patterns" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"sha" text NOT NULL,
	"parent_sha" text,
	"branch" text NOT NULL,
	"author" text,
	"message" text,
	"committed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "health_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"validation_run_id" uuid NOT NULL,
	"architecture_score" integer NOT NULL,
	"intent_score" integer NOT NULL,
	"architecture_breakdown" jsonb NOT NULL,
	"intent_breakdown" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repositories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"remote_url" text,
	"default_branch" text DEFAULT 'main' NOT NULL,
	"validator_token_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"label" text NOT NULL,
	"revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenet_evaluations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"validation_run_id" uuid NOT NULL,
	"tenet_id" uuid,
	"status" "compliance_status" NOT NULL,
	"summary" text NOT NULL,
	"violation_fingerprints" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"type" "tenet_type" NOT NULL,
	"severity" "severity" NOT NULL,
	"enforcement" "enforcement" NOT NULL,
	"status" "tenet_status" DEFAULT 'draft' NOT NULL,
	"scope" jsonb NOT NULL,
	"constraint" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "validation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"commit_id" uuid,
	"base_sha" text,
	"head_sha" text NOT NULL,
	"result" "validation_status" NOT NULL,
	"analyzer_version" text NOT NULL,
	"changed_files" jsonb NOT NULL,
	"graph_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "violations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repository_id" uuid NOT NULL,
	"validation_run_id" uuid NOT NULL,
	"tenet_id" uuid,
	"fingerprint" text NOT NULL,
	"type" text NOT NULL,
	"severity" "severity" NOT NULL,
	"status" "violation_status" NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"affected_files" jsonb NOT NULL,
	"evidence" jsonb NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "architecture_edges" ADD CONSTRAINT "architecture_edges_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "architecture_edges" ADD CONSTRAINT "architecture_edges_source_node_id_architecture_nodes_id_fk" FOREIGN KEY ("source_node_id") REFERENCES "public"."architecture_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "architecture_edges" ADD CONSTRAINT "architecture_edges_target_node_id_architecture_nodes_id_fk" FOREIGN KEY ("target_node_id") REFERENCES "public"."architecture_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "architecture_nodes" ADD CONSTRAINT "architecture_nodes_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commits" ADD CONSTRAINT "commits_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_snapshots" ADD CONSTRAINT "health_snapshots_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_snapshots" ADD CONSTRAINT "health_snapshots_validation_run_id_validation_runs_id_fk" FOREIGN KEY ("validation_run_id") REFERENCES "public"."validation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_tokens" ADD CONSTRAINT "repository_tokens_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenet_evaluations" ADD CONSTRAINT "tenet_evaluations_validation_run_id_validation_runs_id_fk" FOREIGN KEY ("validation_run_id") REFERENCES "public"."validation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenet_evaluations" ADD CONSTRAINT "tenet_evaluations_tenet_id_tenets_id_fk" FOREIGN KEY ("tenet_id") REFERENCES "public"."tenets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenets" ADD CONSTRAINT "tenets_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "validation_runs" ADD CONSTRAINT "validation_runs_commit_id_commits_id_fk" FOREIGN KEY ("commit_id") REFERENCES "public"."commits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violations" ADD CONSTRAINT "violations_repository_id_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violations" ADD CONSTRAINT "violations_validation_run_id_validation_runs_id_fk" FOREIGN KEY ("validation_run_id") REFERENCES "public"."validation_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "violations" ADD CONSTRAINT "violations_tenet_id_tenets_id_fk" FOREIGN KEY ("tenet_id") REFERENCES "public"."tenets"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "architecture_edges_unique" ON "architecture_edges" USING btree ("repository_id","source_node_id","target_node_id");--> statement-breakpoint
CREATE UNIQUE INDEX "architecture_nodes_repository_key_unique" ON "architecture_nodes" USING btree ("repository_id","node_key");--> statement-breakpoint
CREATE UNIQUE INDEX "commits_repository_sha_unique" ON "commits" USING btree ("repository_id","sha");--> statement-breakpoint
CREATE INDEX "health_snapshots_repository_created_index" ON "health_snapshots" USING btree ("repository_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "repositories_slug_unique" ON "repositories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "repository_tokens_repository_index" ON "repository_tokens" USING btree ("repository_id");--> statement-breakpoint
CREATE INDEX "tenet_evaluations_run_index" ON "tenet_evaluations" USING btree ("validation_run_id");--> statement-breakpoint
CREATE INDEX "tenets_repository_status_index" ON "tenets" USING btree ("repository_id","status");--> statement-breakpoint
CREATE INDEX "validation_runs_repository_created_index" ON "validation_runs" USING btree ("repository_id","created_at");--> statement-breakpoint
CREATE INDEX "violations_repository_status_index" ON "violations" USING btree ("repository_id","status");--> statement-breakpoint
CREATE INDEX "violations_fingerprint_index" ON "violations" USING btree ("repository_id","fingerprint");