import { and, desc, eq, ne } from "drizzle-orm";

import type { ControlPlaneDatabase } from "./validation-run-persistence";
import {
  healthSnapshots,
  repositories,
  tenets,
  validationRuns,
  violations,
} from "../db/schema";

const findRepository = async (database: ControlPlaneDatabase, slug: string) => {
  const [repository] = await database
    .select({
      id: repositories.id,
      slug: repositories.slug,
      name: repositories.name,
      displayName: repositories.displayName,
      defaultBranch: repositories.defaultBranch,
      createdAt: repositories.createdAt,
      updatedAt: repositories.updatedAt,
    })
    .from(repositories)
    .where(eq(repositories.slug, slug))
    .limit(1);

  return repository;
};

export const getRepositorySummary = async (
  database: ControlPlaneDatabase,
  slug: string,
) => {
  const repository = await findRepository(database, slug);
  if (!repository) {
    return undefined;
  }

  const [latestHealth] = await database
    .select({
      validationRunId: healthSnapshots.validationRunId,
      architectureScore: healthSnapshots.architectureScore,
      intentScore: healthSnapshots.intentScore,
      validatedAt: healthSnapshots.validatedAt,
    })
    .from(healthSnapshots)
    .where(eq(healthSnapshots.repositoryId, repository.id))
    .orderBy(desc(healthSnapshots.validatedAt))
    .limit(1);
  const activeViolations = await database
    .select({ id: violations.id })
    .from(violations)
    .where(
      and(
        eq(violations.repositoryId, repository.id),
        ne(violations.status, "resolved"),
      ),
    );

  return {
    repository,
    latestHealth: latestHealth ?? null,
    activeViolationCount: activeViolations.length,
  };
};

export const getRecentValidationRuns = async (
  database: ControlPlaneDatabase,
  slug: string,
) => {
  const repository = await findRepository(database, slug);
  if (!repository) {
    return undefined;
  }

  const runs = await database
    .select({
      id: validationRuns.id,
      ingestionKey: validationRuns.ingestionKey,
      source: validationRuns.source,
      status: validationRuns.result,
      baseSha: validationRuns.baseSha,
      headSha: validationRuns.headSha,
      branch: validationRuns.branch,
      author: validationRuns.author,
      commitMessage: validationRuns.commitMessage,
      warningCount: validationRuns.warningCount,
      architectureScore: validationRuns.architectureScore,
      intentScore: validationRuns.intentScore,
      graphSnapshot: validationRuns.graphSnapshot,
      validatedAt: validationRuns.validatedAt,
      createdAt: validationRuns.createdAt,
    })
    .from(validationRuns)
    .where(eq(validationRuns.repositoryId, repository.id))
    .orderBy(desc(validationRuns.validatedAt))
    .limit(50);

  return { repository, runs };
};

export const getRepositoryViolations = async (
  database: ControlPlaneDatabase,
  slug: string,
) => {
  const repository = await findRepository(database, slug);
  if (!repository) {
    return undefined;
  }

  const items = await database
    .select({
      id: violations.id,
      fingerprint: violations.fingerprint,
      type: violations.type,
      severity: violations.severity,
      enforcement: violations.enforcement,
      status: violations.status,
      title: violations.title,
      message: violations.message,
      affectedFiles: violations.affectedFiles,
      evidence: violations.evidence,
      details: violations.details,
      healthImpact: violations.healthImpact,
      firstSeenAt: violations.firstSeenAt,
      lastSeenAt: violations.lastSeenAt,
      resolvedAt: violations.resolvedAt,
      tenetName: tenets.name,
      tenetExternalId: tenets.externalId,
    })
    .from(violations)
    .leftJoin(tenets, eq(violations.tenetId, tenets.id))
    .where(eq(violations.repositoryId, repository.id))
    .orderBy(desc(violations.lastSeenAt));

  return { repository, violations: items };
};

export const getRepositoryHealthHistory = async (
  database: ControlPlaneDatabase,
  slug: string,
) => {
  const repository = await findRepository(database, slug);
  if (!repository) {
    return undefined;
  }

  const snapshots = await database
    .select({
      validationRunId: healthSnapshots.validationRunId,
      architectureScore: healthSnapshots.architectureScore,
      intentScore: healthSnapshots.intentScore,
      architectureBreakdown: healthSnapshots.architectureBreakdown,
      intentBreakdown: healthSnapshots.intentBreakdown,
      validatedAt: healthSnapshots.validatedAt,
      createdAt: healthSnapshots.createdAt,
    })
    .from(healthSnapshots)
    .where(eq(healthSnapshots.repositoryId, repository.id))
    .orderBy(desc(healthSnapshots.validatedAt))
    .limit(100);

  return { repository, snapshots };
};

export const getRepositoryTenets = async (
  database: ControlPlaneDatabase,
  slug: string,
) => {
  const repository = await findRepository(database, slug);
  if (!repository) {
    return undefined;
  }

  const items = await database
    .select({
      id: tenets.id,
      externalId: tenets.externalId,
      name: tenets.name,
      description: tenets.description,
      type: tenets.type,
      severity: tenets.severity,
      enforcement: tenets.enforcement,
      status: tenets.status,
      scope: tenets.scope,
      constraint: tenets.constraint,
      updatedAt: tenets.updatedAt,
    })
    .from(tenets)
    .where(eq(tenets.repositoryId, repository.id))
    .orderBy(tenets.name);

  return { repository, tenets: items };
};
