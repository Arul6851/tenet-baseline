import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const tenetType = pgEnum("tenet_type", ["architecture", "business"]);
export const severity = pgEnum("severity", [
  "low",
  "medium",
  "high",
  "critical",
]);
export const enforcement = pgEnum("enforcement", [
  "report",
  "warn",
  "block_merge",
]);
export const tenetStatus = pgEnum("tenet_status", ["draft", "active", "disabled"]);
export const validationStatus = pgEnum("validation_status", ["PASS", "WARN", "BLOCK"]);
export const violationStatus = pgEnum("violation_status", [
  "active",
  "resolved",
  "blocked",
]);
export const complianceStatus = pgEnum("compliance_status", [
  "satisfied",
  "at_risk",
  "violated",
]);

export const repositories = pgTable(
  "repositories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    remoteUrl: text("remote_url"),
    defaultBranch: text("default_branch").notNull().default("main"),
    validatorTokenHash: text("validator_token_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex("repositories_slug_unique").on(table.slug)],
);

export const tenets = pgTable(
  "tenets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    /** Stable ID from repository configuration or a confirmed control-plane policy. */
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    type: tenetType("type").notNull(),
    severity: severity("severity").notNull(),
    enforcement: enforcement("enforcement").notNull(),
    status: tenetStatus("status").notNull().default("draft"),
    scope: jsonb("scope").$type<string[]>().notNull(),
    constraint: jsonb("constraint").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("tenets_repository_status_index").on(table.repositoryId, table.status),
    uniqueIndex("tenets_repository_external_id_unique").on(
      table.repositoryId,
      table.externalId,
    ),
  ],
);

export const architectureNodes = pgTable(
  "architecture_nodes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    nodeKey: text("node_key").notNull(),
    label: text("label").notNull(),
    pathPatterns: jsonb("path_patterns").$type<string[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("architecture_nodes_repository_key_unique").on(
      table.repositoryId,
      table.nodeKey,
    ),
  ],
);

export const architectureEdges = pgTable(
  "architecture_edges",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    sourceNodeId: uuid("source_node_id")
      .notNull()
      .references(() => architectureNodes.id, { onDelete: "cascade" }),
    targetNodeId: uuid("target_node_id")
      .notNull()
      .references(() => architectureNodes.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("architecture_edges_unique").on(
      table.repositoryId,
      table.sourceNodeId,
      table.targetNodeId,
    ),
  ],
);

export const commits = pgTable(
  "commits",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    sha: text("sha").notNull(),
    parentSha: text("parent_sha"),
    branch: text("branch").notNull(),
    author: text("author"),
    message: text("message"),
    committedAt: timestamp("committed_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("commits_repository_sha_unique").on(table.repositoryId, table.sha)],
);

export const validationRuns = pgTable(
  "validation_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    /** Client-generated UUID; unique with repositoryId for safe retries. */
    ingestionKey: text("ingestion_key").notNull(),
    commitId: uuid("commit_id").references(() => commits.id, { onDelete: "set null" }),
    source: text("source").notNull().default("cli"),
    baseSha: text("base_sha"),
    headSha: text("head_sha"),
    branch: text("branch"),
    author: text("author"),
    commitMessage: text("commit_message"),
    result: validationStatus("result").notNull(),
    analyzerVersion: text("analyzer_version").notNull(),
    changedFiles: jsonb("changed_files").$type<string[]>().notNull(),
    warningCount: integer("warning_count").notNull().default(0),
    warnings: jsonb("warnings").$type<unknown[]>().notNull().default([]),
    architectureScore: integer("architecture_score").notNull(),
    intentScore: integer("intent_score").notNull(),
    graphSnapshot: jsonb("graph_snapshot").$type<Record<string, unknown>>().notNull(),
    validatedAt: timestamp("validated_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("validation_runs_repository_created_index").on(table.repositoryId, table.createdAt),
    uniqueIndex("validation_runs_repository_ingestion_key_unique").on(
      table.repositoryId,
      table.ingestionKey,
    ),
  ],
);

export const violations = pgTable(
  "violations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    validationRunId: uuid("validation_run_id")
      .notNull()
      .references(() => validationRuns.id, { onDelete: "cascade" }),
    tenetId: uuid("tenet_id").references(() => tenets.id, { onDelete: "set null" }),
    fingerprint: text("fingerprint").notNull(),
    type: text("type").notNull(),
    severity: severity("severity").notNull(),
    enforcement: enforcement("enforcement").notNull(),
    status: violationStatus("status").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    affectedFiles: jsonb("affected_files").$type<string[]>().notNull(),
    evidence: jsonb("evidence").$type<unknown[]>().notNull(),
    /** Architecture/semantic details emitted by the deterministic engine. */
    details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
    /** The deterministic deductions this logical violation contributed to. */
    healthImpact: jsonb("health_impact")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("violations_repository_status_index").on(table.repositoryId, table.status),
    uniqueIndex("violations_repository_fingerprint_unique").on(
      table.repositoryId,
      table.fingerprint,
    ),
  ],
);

/**
 * A logical violation is unique by repository + fingerprint. This table keeps
 * the immutable evidence observed in each individual validation run so trend
 * and change views can be built without duplicating lifecycle records.
 */
export const validationRunViolations = pgTable(
  "validation_run_violations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    validationRunId: uuid("validation_run_id")
      .notNull()
      .references(() => validationRuns.id, { onDelete: "cascade" }),
    violationId: uuid("violation_id")
      .notNull()
      .references(() => violations.id, { onDelete: "cascade" }),
    status: violationStatus("status").notNull(),
    affectedFiles: jsonb("affected_files").$type<string[]>().notNull(),
    evidence: jsonb("evidence").$type<unknown[]>().notNull(),
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
    healthImpact: jsonb("health_impact").$type<Record<string, unknown>>().notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("validation_run_violations_run_violation_unique").on(
      table.validationRunId,
      table.violationId,
    ),
    index("validation_run_violations_violation_index").on(table.violationId),
  ],
);

export const tenetEvaluations = pgTable(
  "tenet_evaluations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    validationRunId: uuid("validation_run_id")
      .notNull()
      .references(() => validationRuns.id, { onDelete: "cascade" }),
    tenetId: uuid("tenet_id").references(() => tenets.id, { onDelete: "set null" }),
    status: complianceStatus("status").notNull(),
    summary: text("summary").notNull(),
    violationFingerprints: jsonb("violation_fingerprints").$type<string[]>().notNull(),
  },
  (table) => [
    index("tenet_evaluations_run_index").on(table.validationRunId),
    uniqueIndex("tenet_evaluations_run_tenet_unique").on(
      table.validationRunId,
      table.tenetId,
    ),
  ],
);

export const healthSnapshots = pgTable(
  "health_snapshots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    validationRunId: uuid("validation_run_id")
      .notNull()
      .references(() => validationRuns.id, { onDelete: "cascade" }),
    architectureScore: integer("architecture_score").notNull(),
    intentScore: integer("intent_score").notNull(),
    architectureBreakdown: jsonb("architecture_breakdown")
      .$type<unknown[]>()
      .notNull(),
    intentBreakdown: jsonb("intent_breakdown").$type<unknown[]>().notNull(),
    /** Timestamp from the deterministic local validation, not ingestion time. */
    validatedAt: timestamp("validated_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("health_snapshots_repository_validated_index").on(
      table.repositoryId,
      table.validatedAt,
    ),
    uniqueIndex("health_snapshots_validation_run_unique").on(table.validationRunId),
  ],
);

export const repositoryTokens = pgTable(
  "repository_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    repositoryId: uuid("repository_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    label: text("label").notNull(),
    revoked: boolean("revoked").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("repository_tokens_repository_index").on(table.repositoryId)],
);

export const databaseSchema = {
  repositories,
  repositoryTokens,
  tenets,
  architectureNodes,
  architectureEdges,
  commits,
  validationRuns,
  violations,
  validationRunViolations,
  tenetEvaluations,
  healthSnapshots,
};
