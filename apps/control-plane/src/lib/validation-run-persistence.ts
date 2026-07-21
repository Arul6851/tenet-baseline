import {
  and,
  eq,
  inArray,
  ne,
} from "drizzle-orm";

import type {
  ArchitectureEdge,
  Tenet,
  TenetEvaluation,
  ValidationRunIngestion,
  Violation,
} from "@tenet/contracts";

import type { createDatabase } from "../db/client";
import {
  resolvedViolationFingerprints,
  resolvedViolationIds,
} from "./violation-lifecycle";
import {
  architectureEdges,
  architectureNodes,
  commits,
  healthSnapshots,
  repositories,
  tenetEvaluations,
  tenets,
  validationRunViolations,
  validationRuns,
  violations,
} from "../db/schema";

/** The API parses this shared Zod-backed contract before persistence. */
export type ValidationRunIngestionInput = ValidationRunIngestion;

export type ArchitectureEdgeInput =
  | readonly [string, string]
  | ArchitectureEdge;

export type ControlPlaneDatabase = ReturnType<typeof createDatabase>;

type DatabaseTransaction = Parameters<
  Parameters<ControlPlaneDatabase["transaction"]>[0]
>[0];
type DatabaseExecutor = ControlPlaneDatabase | DatabaseTransaction;

export interface ValidationRunPersistenceResult {
  repositoryId: string;
  validationRunId: string;
  idempotent: boolean;
  resolvedViolationFingerprints: readonly string[];
}

const jsonObject = (value: object): Record<string, unknown> =>
  value as Record<string, unknown>;

const dateFromIso = (value: string): Date => {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error("Validation ingestion completedAt must be a valid ISO timestamp.");
  }

  return parsed;
};

const edgeEndpoints = (edge: ArchitectureEdgeInput): ArchitectureEdge => {
  if ("sourceModule" in edge) {
    return edge;
  }

  const [sourceModule, targetModule] = edge;
  return { sourceModule, targetModule };
};

export interface ViolationPersistenceSnapshot {
  details: Record<string, unknown>;
  healthImpact: Record<string, unknown>;
}

/**
 * Preserves the exact deterministic evidence and deductions emitted by the
 * engine. The persistence layer does not reinterpret either value.
 */
export const buildViolationPersistenceSnapshot = (
  violation: Violation,
  health: ValidationRunIngestionInput["health"],
): ViolationPersistenceSnapshot => ({
  details: {
    ...(violation.tenetName === undefined ? {} : { tenetName: violation.tenetName }),
    ...(violation.tenetDescription === undefined
      ? {}
      : { tenetDescription: violation.tenetDescription }),
    ...(violation.architectureFinding === undefined
      ? {}
      : { architectureFinding: violation.architectureFinding }),
    ...(violation.architecture === undefined
      ? {}
      : { architecture: violation.architecture }),
    ...(violation.semantic === undefined ? {} : { semantic: violation.semantic }),
  },
  healthImpact: {
    architecture: health.architecture.deductions.filter(
      (deduction) => deduction.key === violation.fingerprint,
    ),
    intent: health.intent.deductions.filter(
      (deduction) => deduction.key === violation.tenetId,
    ),
  },
});

export interface HealthSnapshotPersistenceValues {
  repositoryId: string;
  validationRunId: string;
  architectureScore: number;
  intentScore: number;
  architectureBreakdown: unknown[];
  intentBreakdown: unknown[];
  validatedAt: Date;
}

/** Maps scores without recalculation so health history remains engine-owned. */
export const buildHealthSnapshotPersistenceValues = (
  repositoryId: string,
  validationRunId: string,
  health: ValidationRunIngestionInput["health"],
  completedAt: Date,
): HealthSnapshotPersistenceValues => ({
  repositoryId,
  validationRunId,
  architectureScore: health.architecture.score,
  intentScore: health.intent.score,
  architectureBreakdown: [...health.architecture.deductions],
  intentBreakdown: [...health.intent.deductions],
  validatedAt: completedAt,
});

const deduplicateBy = <T>(
  values: readonly T[],
  key: (value: T) => string,
): readonly T[] => {
  const uniqueValues = new Map<string, T>();

  for (const value of values) {
    if (!uniqueValues.has(key(value))) {
      uniqueValues.set(key(value), value);
    }
  }

  return [...uniqueValues.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value);
};

const upsertRepository = async (
  database: DatabaseExecutor,
  input: ValidationRunIngestionInput["repository"],
) => {
  const now = new Date();
  const [repository] = await database
    .insert(repositories)
    .values({
      name: input.name,
      slug: input.slug,
      displayName: input.displayName,
      defaultBranch: input.defaultBranch,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: repositories.slug,
      set: {
        name: input.name,
        displayName: input.displayName,
        defaultBranch: input.defaultBranch,
        updatedAt: now,
      },
    })
    .returning({
      id: repositories.id,
      defaultBranch: repositories.defaultBranch,
    });

  if (!repository) {
    throw new Error("Repository upsert did not return a repository record.");
  }

  return repository;
};

const upsertTenets = async (
  database: DatabaseExecutor,
  repositoryId: string,
  inputTenets: readonly Tenet[],
) => {
  const now = new Date();

  for (const tenet of deduplicateBy(inputTenets, (tenet) => tenet.id)) {
    await database
      .insert(tenets)
      .values({
        repositoryId,
        externalId: tenet.id,
        name: tenet.name,
        description: tenet.description,
        type: tenet.type,
        severity: tenet.severity,
        enforcement: tenet.enforcement,
        status: tenet.status,
        scope: [...tenet.scope],
        constraint: jsonObject(tenet.constraint),
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [tenets.repositoryId, tenets.externalId],
        set: {
          name: tenet.name,
          description: tenet.description,
          type: tenet.type,
          severity: tenet.severity,
          enforcement: tenet.enforcement,
          status: tenet.status,
          scope: [...tenet.scope],
          constraint: jsonObject(tenet.constraint),
          updatedAt: now,
        },
      });
  }

  const persistedTenets = await database
    .select({ id: tenets.id, externalId: tenets.externalId })
    .from(tenets)
    .where(eq(tenets.repositoryId, repositoryId));

  return new Map(
    persistedTenets.map((tenet) => [tenet.externalId, tenet.id]),
  );
};

const syncArchitecture = async (
  database: DatabaseExecutor,
  repositoryId: string,
  architecture: ValidationRunIngestionInput["architecture"],
): Promise<void> => {
  const desiredModules = deduplicateBy(architecture.modules, (module) => module.id);
  const desiredNodeKeys = new Set(desiredModules.map((module) => module.id));

  for (const module of desiredModules) {
    await database
      .insert(architectureNodes)
      .values({
        repositoryId,
        nodeKey: module.id,
        label: module.label ?? module.id,
        pathPatterns: [...module.paths],
      })
      .onConflictDoUpdate({
        target: [architectureNodes.repositoryId, architectureNodes.nodeKey],
        set: {
          label: module.label ?? module.id,
          pathPatterns: [...module.paths],
        },
      });
  }

  const persistedNodes = await database
    .select({ id: architectureNodes.id, nodeKey: architectureNodes.nodeKey })
    .from(architectureNodes)
    .where(eq(architectureNodes.repositoryId, repositoryId));
  const nodeIdByKey = new Map(
    persistedNodes.map((node) => [node.nodeKey, node.id]),
  );

  const desiredEdges = deduplicateBy(
    architecture.intendedEdges.map(edgeEndpoints),
    (edge) => `${edge.sourceModule}\u0000${edge.targetModule}`,
  );
  const desiredPairs = new Set<string>();

  for (const edge of desiredEdges) {
    const sourceNodeId = nodeIdByKey.get(edge.sourceModule);
    const targetNodeId = nodeIdByKey.get(edge.targetModule);

    if (!sourceNodeId || !targetNodeId) {
      throw new Error(
        `Intended architecture edge ${edge.sourceModule} -> ${edge.targetModule} references an unknown module.`,
      );
    }

    desiredPairs.add(`${sourceNodeId}\u0000${targetNodeId}`);
    await database
      .insert(architectureEdges)
      .values({ repositoryId, sourceNodeId, targetNodeId })
      .onConflictDoNothing({
        target: [
          architectureEdges.repositoryId,
          architectureEdges.sourceNodeId,
          architectureEdges.targetNodeId,
        ],
      });
  }

  const persistedEdges = await database
    .select({
      id: architectureEdges.id,
      sourceNodeId: architectureEdges.sourceNodeId,
      targetNodeId: architectureEdges.targetNodeId,
    })
    .from(architectureEdges)
    .where(eq(architectureEdges.repositoryId, repositoryId));
  const staleEdgeIds = persistedEdges
    .filter(
      (edge) => !desiredPairs.has(`${edge.sourceNodeId}\u0000${edge.targetNodeId}`),
    )
    .map((edge) => edge.id);

  if (staleEdgeIds.length > 0) {
    await database
      .delete(architectureEdges)
      .where(inArray(architectureEdges.id, staleEdgeIds));
  }

  const staleNodeIds = persistedNodes
    .filter((node) => !desiredNodeKeys.has(node.nodeKey))
    .map((node) => node.id);

  if (staleNodeIds.length > 0) {
    await database
      .delete(architectureNodes)
      .where(inArray(architectureNodes.id, staleNodeIds));
  }
};

const upsertCommit = async (
  database: DatabaseExecutor,
  repositoryId: string,
  input: ValidationRunIngestionInput,
  completedAt: Date,
): Promise<string | undefined> => {
  const { git } = input;

  if (git.headSha === undefined) {
    return undefined;
  }

  const [commit] = await database
    .insert(commits)
    .values({
      repositoryId,
      sha: git.headSha,
      ...(git.baseSha === undefined ? {} : { parentSha: git.baseSha }),
      branch: git.branch ?? input.repository.defaultBranch,
      ...(git.author === undefined ? {} : { author: git.author }),
      ...(git.message === undefined ? {} : { message: git.message }),
      committedAt: completedAt,
    })
    .onConflictDoUpdate({
      target: [commits.repositoryId, commits.sha],
      set: {
        ...(git.baseSha === undefined ? {} : { parentSha: git.baseSha }),
        branch: git.branch ?? input.repository.defaultBranch,
        ...(git.author === undefined ? {} : { author: git.author }),
        ...(git.message === undefined ? {} : { message: git.message }),
      },
    })
    .returning({ id: commits.id });

  if (!commit) {
    throw new Error("Commit upsert did not return a commit record.");
  }

  return commit.id;
};

const insertValidationRun = async (
  database: DatabaseExecutor,
  repositoryId: string,
  commitId: string | undefined,
  input: ValidationRunIngestionInput,
  completedAt: Date,
) => {
  const graphSnapshot = {
    nodes: input.graph.nodes,
    edges: input.graph.edges,
    intendedArchitecture: {
      modules: input.architecture.modules,
      intendedEdges: input.architecture.intendedEdges,
      allowedEdges: input.architecture.allowedEdges,
    },
  };

  const [validationRun] = await database
    .insert(validationRuns)
    .values({
      repositoryId,
      ingestionKey: input.idempotencyKey,
      ...(commitId === undefined ? {} : { commitId }),
      source: input.source,
      ...(input.git.baseSha === undefined ? {} : { baseSha: input.git.baseSha }),
      ...(input.git.headSha === undefined ? {} : { headSha: input.git.headSha }),
      ...(input.git.branch === undefined ? {} : { branch: input.git.branch }),
      ...(input.git.author === undefined ? {} : { author: input.git.author }),
      ...(input.git.message === undefined
        ? {}
        : { commitMessage: input.git.message }),
      result: input.status,
      analyzerVersion: input.analyzerVersion,
      changedFiles: [...input.changedFiles],
      warningCount: input.warnings.length,
      warnings: [...input.warnings],
      architectureScore: input.health.architecture.score,
      intentScore: input.health.intent.score,
      graphSnapshot: jsonObject(graphSnapshot),
      validatedAt: completedAt,
    })
    .onConflictDoNothing({
      target: [validationRuns.repositoryId, validationRuns.ingestionKey],
    })
    .returning({ id: validationRuns.id });

  return validationRun;
};

const ensureEvaluationTenet = (
  tenetIdByExternalId: ReadonlyMap<string, string>,
  tenetId: string,
): string => {
  const persistedTenetId = tenetIdByExternalId.get(tenetId);

  if (!persistedTenetId) {
    throw new Error(
      `Validation payload references Tenet "${tenetId}" that was not supplied for persistence.`,
    );
  }

  return persistedTenetId;
};

const persistEvaluations = async (
  database: DatabaseExecutor,
  validationRunId: string,
  tenetIdByExternalId: ReadonlyMap<string, string>,
  evaluations: readonly TenetEvaluation[],
): Promise<void> => {
  for (const evaluation of deduplicateBy(evaluations, (item) => item.tenetId)) {
    const tenetId = ensureEvaluationTenet(tenetIdByExternalId, evaluation.tenetId);

    await database
      .insert(tenetEvaluations)
      .values({
        validationRunId,
        tenetId,
        status: evaluation.status,
        summary: evaluation.summary,
        violationFingerprints: [...evaluation.violationFingerprints],
      })
      .onConflictDoUpdate({
        target: [tenetEvaluations.validationRunId, tenetEvaluations.tenetId],
        set: {
          status: evaluation.status,
          summary: evaluation.summary,
          violationFingerprints: [...evaluation.violationFingerprints],
        },
      });
  }
};

const persistHealthSnapshot = async (
  database: DatabaseExecutor,
  repositoryId: string,
  validationRunId: string,
  health: ValidationRunIngestionInput["health"],
  completedAt: Date,
): Promise<void> => {
  const values = buildHealthSnapshotPersistenceValues(
    repositoryId,
    validationRunId,
    health,
    completedAt,
  );

  await database
    .insert(healthSnapshots)
    .values(values)
    .onConflictDoUpdate({
      target: healthSnapshots.validationRunId,
      set: {
        architectureScore: health.architecture.score,
        intentScore: health.intent.score,
        architectureBreakdown: [...health.architecture.deductions],
        intentBreakdown: [...health.intent.deductions],
        validatedAt: completedAt,
      },
    });
};

const persistViolations = async (
  database: DatabaseExecutor,
  repositoryId: string,
  validationRunId: string,
  completedAt: Date,
  tenetIdByExternalId: ReadonlyMap<string, string>,
  input: ValidationRunIngestionInput,
): Promise<readonly string[]> => {
  const incomingViolations = deduplicateBy(
    input.violations,
    (violation) => violation.fingerprint,
  );
  const incomingFingerprints = new Set(
    incomingViolations.map((violation) => violation.fingerprint),
  );
  const currentViolations = await database
    .select({ id: violations.id, fingerprint: violations.fingerprint })
    .from(violations)
    .where(
      and(
        eq(violations.repositoryId, repositoryId),
        ne(violations.status, "resolved"),
      ),
    );

  for (const violation of incomingViolations) {
    const tenetId = ensureEvaluationTenet(tenetIdByExternalId, violation.tenetId);
    const { details, healthImpact } = buildViolationPersistenceSnapshot(
      violation,
      input.health,
    );
    const observedStatus = violation.status === "resolved" ? "active" : violation.status;
    const [persistedViolation] = await database
      .insert(violations)
      .values({
        repositoryId,
        validationRunId,
        tenetId,
        fingerprint: violation.fingerprint,
        type: violation.type,
        severity: violation.severity,
        enforcement: violation.enforcement,
        status: observedStatus,
        title: violation.title,
        message: violation.message,
        affectedFiles: [...violation.affectedFiles],
        evidence: [...violation.evidence],
        details,
        healthImpact,
        firstSeenAt: completedAt,
        lastSeenAt: completedAt,
        resolvedAt: null,
      })
      .onConflictDoUpdate({
        target: [violations.repositoryId, violations.fingerprint],
        set: {
          validationRunId,
          tenetId,
          type: violation.type,
          severity: violation.severity,
          enforcement: violation.enforcement,
          status: observedStatus,
          title: violation.title,
          message: violation.message,
          affectedFiles: [...violation.affectedFiles],
          evidence: [...violation.evidence],
          details,
          healthImpact,
          lastSeenAt: completedAt,
          resolvedAt: null,
        },
      })
      .returning({ id: violations.id });

    if (!persistedViolation) {
      throw new Error("Violation upsert did not return a violation record.");
    }

    await database
      .insert(validationRunViolations)
      .values({
        validationRunId,
        violationId: persistedViolation.id,
        status: observedStatus,
        affectedFiles: [...violation.affectedFiles],
        evidence: [...violation.evidence],
        details,
        healthImpact,
        observedAt: completedAt,
      })
      .onConflictDoNothing({
        target: [
          validationRunViolations.validationRunId,
          validationRunViolations.violationId,
        ],
      });
  }

  const resolvedIds = resolvedViolationIds(currentViolations, incomingFingerprints);

  if (resolvedIds.length > 0) {
    await database
      .update(violations)
      .set({ status: "resolved", resolvedAt: completedAt })
      .where(inArray(violations.id, resolvedIds));
  }

  return resolvedViolationFingerprints(currentViolations, incomingFingerprints);
};

/**
 * Writes deterministic validation telemetry after local enforcement has
 * completed. Calling it twice with the same repository + idempotency key is a
 * no-op; it never recalculates or changes the supplied PASS/WARN/BLOCK result.
 */
export class ValidationRunPersistenceService {
  public constructor(private readonly database: ControlPlaneDatabase) {}

  public async ingest(
    input: ValidationRunIngestionInput,
  ): Promise<ValidationRunPersistenceResult> {
    const completedAt = dateFromIso(input.completedAt);

    return this.database.transaction(async (transaction) => {
      const database = transaction as DatabaseExecutor;
      const repository = await upsertRepository(database, input.repository);
      const existingRun = await database
        .select({ id: validationRuns.id })
        .from(validationRuns)
        .where(
          and(
            eq(validationRuns.repositoryId, repository.id),
            eq(validationRuns.ingestionKey, input.idempotencyKey),
          ),
        )
        .limit(1);
      const [existing] = existingRun;

      if (existing) {
        return {
          repositoryId: repository.id,
          validationRunId: existing.id,
          idempotent: true,
          resolvedViolationFingerprints: [],
        };
      }

      const tenetIdByExternalId = await upsertTenets(
        database,
        repository.id,
        input.tenets,
      );
      await syncArchitecture(database, repository.id, input.architecture);
      const commitId = await upsertCommit(
        database,
        repository.id,
        input,
        completedAt,
      );
      const insertedRun = await insertValidationRun(
        database,
        repository.id,
        commitId,
        input,
        completedAt,
      );

      if (!insertedRun) {
        const [concurrentRun] = await database
          .select({ id: validationRuns.id })
          .from(validationRuns)
          .where(
            and(
              eq(validationRuns.repositoryId, repository.id),
              eq(validationRuns.ingestionKey, input.idempotencyKey),
            ),
          )
          .limit(1);

        if (!concurrentRun) {
          throw new Error("Validation run insert conflicted without a persisted run.");
        }

        return {
          repositoryId: repository.id,
          validationRunId: concurrentRun.id,
          idempotent: true,
          resolvedViolationFingerprints: [],
        };
      }

      await persistEvaluations(
        database,
        insertedRun.id,
        tenetIdByExternalId,
        input.tenetEvaluations,
      );
      await persistHealthSnapshot(
        database,
        repository.id,
        insertedRun.id,
        input.health,
        completedAt,
      );
      const resolvedViolationFingerprints = await persistViolations(
        database,
        repository.id,
        insertedRun.id,
        completedAt,
        tenetIdByExternalId,
        input,
      );

      return {
        repositoryId: repository.id,
        validationRunId: insertedRun.id,
        idempotent: false,
        resolvedViolationFingerprints,
      };
    });
  }
}

export const createValidationRunPersistenceService = (
  database: ControlPlaneDatabase,
): ValidationRunPersistenceService => new ValidationRunPersistenceService(database);
