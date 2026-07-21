/**
 * Client-safe view models for the control-plane read APIs.
 *
 * The database intentionally returns JSONB fields as untyped JSON. This file is
 * the narrow boundary where those API responses are validated before product
 * components use them. It has no database or server-only imports so it can be
 * used directly from client components.
 */

export type DashboardValidationStatus = "PASS" | "WARN" | "BLOCK";
export type DashboardViolationStatus = "active" | "resolved" | "blocked";
export type DashboardTenetStatus = "draft" | "active" | "disabled";
export type DashboardTenetType = "architecture" | "business";
export type DashboardSeverity = "low" | "medium" | "high" | "critical";
export type DashboardEnforcement = "report" | "warn" | "block_merge";
export type DashboardImportKind = "runtime" | "type" | "dynamic";

export interface DashboardRepository {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly displayName: string;
  readonly defaultBranch: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface DashboardHealthDeduction {
  readonly key: string;
  readonly label: string;
  readonly amount: number;
  readonly reason: string;
}

export interface DashboardHealthSnapshot {
  readonly validationRunId: string;
  readonly architectureScore: number;
  readonly intentScore: number;
  readonly architectureBreakdown: readonly DashboardHealthDeduction[];
  readonly intentBreakdown: readonly DashboardHealthDeduction[];
  readonly validatedAt: string;
  readonly createdAt: string;
}

export interface DashboardLatestHealth {
  readonly validationRunId: string;
  readonly architectureScore: number;
  readonly intentScore: number;
  readonly validatedAt: string;
}

export interface DashboardRepositorySummary {
  readonly repository: DashboardRepository;
  readonly latestHealth: DashboardLatestHealth | null;
  readonly activeViolationCount: number;
}

export interface DashboardArchitectureNode {
  readonly id: string;
  readonly label?: string;
  readonly paths: readonly string[];
}

export interface DashboardDependencyEdge {
  readonly sourceModule: string;
  readonly targetModule: string;
  readonly sourceFile: string;
  readonly targetFile: string;
  readonly importSpecifier: string;
  readonly importKind: DashboardImportKind;
  readonly line?: number;
  readonly column?: number;
}

export interface DashboardArchitectureEdge {
  readonly sourceModule: string;
  readonly targetModule: string;
}

export interface DashboardIntendedArchitecture {
  readonly modules: readonly DashboardArchitectureNode[];
  readonly intendedEdges: readonly DashboardArchitectureEdge[];
  readonly allowedEdges: readonly DashboardArchitectureEdge[];
}

export interface DashboardGraphSnapshot {
  readonly nodes: readonly DashboardArchitectureNode[];
  readonly edges: readonly DashboardDependencyEdge[];
  readonly intendedArchitecture?: DashboardIntendedArchitecture;
}

export interface DashboardValidationRun {
  readonly id: string;
  readonly ingestionKey: string;
  readonly source: string;
  readonly status: DashboardValidationStatus;
  readonly baseSha: string | null;
  readonly headSha: string | null;
  readonly branch: string | null;
  readonly author: string | null;
  readonly commitMessage: string | null;
  readonly warningCount: number;
  readonly architectureScore: number;
  readonly intentScore: number;
  readonly graphSnapshot: DashboardGraphSnapshot;
  readonly validatedAt: string;
  readonly createdAt: string;
}

export interface DashboardEvidence {
  readonly kind: string;
  readonly file: string;
  readonly line?: number;
  readonly column?: number;
  readonly excerpt: string;
}

export interface DashboardViolation {
  readonly id: string;
  readonly fingerprint: string;
  readonly type: string;
  readonly severity: DashboardSeverity;
  readonly enforcement: DashboardEnforcement;
  readonly status: DashboardViolationStatus;
  readonly title: string;
  readonly message: string;
  readonly affectedFiles: readonly string[];
  readonly evidence: readonly DashboardEvidence[];
  readonly details: Readonly<Record<string, unknown>>;
  readonly healthImpact: Readonly<Record<string, unknown>>;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly resolvedAt: string | null;
  readonly tenetName: string | null;
  readonly tenetExternalId: string | null;
}

export interface DashboardTenet {
  readonly id: string;
  readonly externalId: string;
  readonly name: string;
  readonly description: string;
  readonly type: DashboardTenetType;
  readonly severity: DashboardSeverity;
  readonly enforcement: DashboardEnforcement;
  readonly status: DashboardTenetStatus;
  readonly scope: readonly string[];
  readonly constraint: Readonly<Record<string, unknown>>;
  readonly updatedAt: string;
}

/** A fully parsed aggregate of the five repository-scoped control-plane APIs. */
export interface DashboardData {
  readonly summary: DashboardRepositorySummary;
  /** Convenient aliases for product components; values still originate in summary. */
  readonly repository: DashboardRepository;
  readonly latestHealth: DashboardLatestHealth | null;
  readonly activeViolationCount: number;
  /** Ascending by validated timestamp. */
  readonly runs: readonly DashboardValidationRun[];
  /** Ascending by validated timestamp. */
  readonly healthSnapshots: readonly DashboardHealthSnapshot[];
  /** Alias retained for concise chart-oriented components. */
  readonly snapshots: readonly DashboardHealthSnapshot[];
  readonly violations: readonly DashboardViolation[];
  readonly tenets: readonly DashboardTenet[];
}

export interface DashboardApiPayloads {
  readonly summary: unknown;
  readonly validationRuns: unknown;
  readonly violations: unknown;
  readonly health: unknown;
  readonly tenets: unknown;
}

export type DashboardDataParseResult =
  | { readonly ok: true; readonly data: DashboardData }
  | { readonly ok: false; readonly error: string };

export class DashboardDataError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "DashboardDataError";
  }
}

type JsonRecord = Record<string, unknown>;

const asRecord = (value: unknown, label: string): JsonRecord => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new DashboardDataError(`${label} must be an object.`);
  }

  return value as JsonRecord;
};

const asArray = (value: unknown, label: string): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new DashboardDataError(`${label} must be an array.`);
  }

  return value;
};

const asNonEmptyString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DashboardDataError(`${label} must be a non-empty string.`);
  }

  return value;
};

const asNullableString = (value: unknown, label: string): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  return asNonEmptyString(value, label);
};

const asFiniteNumber = (value: unknown, label: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new DashboardDataError(`${label} must be a finite number.`);
  }

  return value;
};

const asScore = (value: unknown, label: string): number => {
  const score = asFiniteNumber(value, label);

  if (score < 0 || score > 100) {
    throw new DashboardDataError(`${label} must be between 0 and 100.`);
  }

  return score;
};

const asTimestamp = (value: unknown, label: string): string => {
  const timestamp = asNonEmptyString(value, label);

  if (Number.isNaN(Date.parse(timestamp))) {
    throw new DashboardDataError(`${label} must be an ISO-compatible timestamp.`);
  }

  return timestamp;
};

const asStringArray = (value: unknown, label: string): readonly string[] =>
  asArray(value, label).map((item, index) =>
    asNonEmptyString(item, `${label}[${index}]`),
  );

const isOneOf = <T extends string>(
  value: unknown,
  values: readonly T[],
  label: string,
): T => {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new DashboardDataError(`${label} is not a supported value.`);
  }

  return value as T;
};

const parseRepository = (value: unknown, label: string): DashboardRepository => {
  const record = asRecord(value, label);

  return {
    id: asNonEmptyString(record.id, `${label}.id`),
    slug: asNonEmptyString(record.slug, `${label}.slug`),
    name: asNonEmptyString(record.name, `${label}.name`),
    displayName: asNonEmptyString(record.displayName, `${label}.displayName`),
    defaultBranch: asNonEmptyString(record.defaultBranch, `${label}.defaultBranch`),
    createdAt: asTimestamp(record.createdAt, `${label}.createdAt`),
    updatedAt: asTimestamp(record.updatedAt, `${label}.updatedAt`),
  };
};

const parseHealthDeduction = (
  value: unknown,
  label: string,
): DashboardHealthDeduction => {
  const record = asRecord(value, label);

  return {
    key: asNonEmptyString(record.key, `${label}.key`),
    label: asNonEmptyString(record.label, `${label}.label`),
    amount: asFiniteNumber(record.amount, `${label}.amount`),
    reason: asNonEmptyString(record.reason, `${label}.reason`),
  };
};

const parseHealthSnapshot = (
  value: unknown,
  label: string,
): DashboardHealthSnapshot => {
  const record = asRecord(value, label);

  return {
    validationRunId: asNonEmptyString(record.validationRunId, `${label}.validationRunId`),
    architectureScore: asScore(record.architectureScore, `${label}.architectureScore`),
    intentScore: asScore(record.intentScore, `${label}.intentScore`),
    architectureBreakdown: asArray(
      record.architectureBreakdown,
      `${label}.architectureBreakdown`,
    ).map((item, index) =>
      parseHealthDeduction(item, `${label}.architectureBreakdown[${index}]`),
    ),
    intentBreakdown: asArray(record.intentBreakdown, `${label}.intentBreakdown`).map(
      (item, index) => parseHealthDeduction(item, `${label}.intentBreakdown[${index}]`),
    ),
    validatedAt: asTimestamp(record.validatedAt, `${label}.validatedAt`),
    createdAt: asTimestamp(record.createdAt, `${label}.createdAt`),
  };
};

const parseArchitectureNode = (
  value: unknown,
  label: string,
): DashboardArchitectureNode => {
  const record = asRecord(value, label);
  const nodeLabel = record.label;

  return {
    id: asNonEmptyString(record.id, `${label}.id`),
    ...(nodeLabel === undefined || nodeLabel === null
      ? {}
      : { label: asNonEmptyString(nodeLabel, `${label}.label`) }),
    paths: asStringArray(record.paths, `${label}.paths`),
  };
};

const parseArchitectureEdge = (
  value: unknown,
  label: string,
): DashboardArchitectureEdge => {
  if (Array.isArray(value)) {
    const [sourceModule, targetModule] = value;
    return {
      sourceModule: asNonEmptyString(sourceModule, `${label}[0]`),
      targetModule: asNonEmptyString(targetModule, `${label}[1]`),
    };
  }

  const record = asRecord(value, label);
  return {
    sourceModule: asNonEmptyString(record.sourceModule, `${label}.sourceModule`),
    targetModule: asNonEmptyString(record.targetModule, `${label}.targetModule`),
  };
};

const parseDependencyEdge = (
  value: unknown,
  label: string,
): DashboardDependencyEdge => {
  const record = asRecord(value, label);
  const line = record.line;
  const column = record.column;

  return {
    sourceModule: asNonEmptyString(record.sourceModule, `${label}.sourceModule`),
    targetModule: asNonEmptyString(record.targetModule, `${label}.targetModule`),
    sourceFile: asNonEmptyString(record.sourceFile, `${label}.sourceFile`),
    targetFile: asNonEmptyString(record.targetFile, `${label}.targetFile`),
    importSpecifier: asNonEmptyString(record.importSpecifier, `${label}.importSpecifier`),
    importKind: isOneOf(
      record.importKind,
      ["runtime", "type", "dynamic"],
      `${label}.importKind`,
    ),
    ...(line === undefined || line === null
      ? {}
      : { line: asFiniteNumber(line, `${label}.line`) }),
    ...(column === undefined || column === null
      ? {}
      : { column: asFiniteNumber(column, `${label}.column`) }),
  };
};

const parseGraphSnapshot = (
  value: unknown,
  label: string,
): DashboardGraphSnapshot => {
  const record = asRecord(value, label);
  const intendedValue = record.intendedArchitecture;
  const intendedArchitecture =
    intendedValue === undefined || intendedValue === null
      ? undefined
      : (() => {
          const intended = asRecord(intendedValue, `${label}.intendedArchitecture`);
          return {
            modules: asArray(intended.modules, `${label}.intendedArchitecture.modules`).map(
              (item, index) =>
                parseArchitectureNode(
                  item,
                  `${label}.intendedArchitecture.modules[${index}]`,
                ),
            ),
            intendedEdges: asArray(
              intended.intendedEdges,
              `${label}.intendedArchitecture.intendedEdges`,
            ).map((item, index) =>
              parseArchitectureEdge(
                item,
                `${label}.intendedArchitecture.intendedEdges[${index}]`,
              ),
            ),
            allowedEdges: asArray(
              intended.allowedEdges,
              `${label}.intendedArchitecture.allowedEdges`,
            ).map((item, index) =>
              parseArchitectureEdge(
                item,
                `${label}.intendedArchitecture.allowedEdges[${index}]`,
              ),
            ),
          } satisfies DashboardIntendedArchitecture;
        })();

  return {
    nodes: asArray(record.nodes, `${label}.nodes`).map((item, index) =>
      parseArchitectureNode(item, `${label}.nodes[${index}]`),
    ),
    edges: asArray(record.edges, `${label}.edges`).map((item, index) =>
      parseDependencyEdge(item, `${label}.edges[${index}]`),
    ),
    ...(intendedArchitecture === undefined ? {} : { intendedArchitecture }),
  };
};

const parseValidationRun = (
  value: unknown,
  label: string,
): DashboardValidationRun => {
  const record = asRecord(value, label);

  return {
    id: asNonEmptyString(record.id, `${label}.id`),
    ingestionKey: asNonEmptyString(record.ingestionKey, `${label}.ingestionKey`),
    source: asNonEmptyString(record.source, `${label}.source`),
    status: isOneOf(record.status, ["PASS", "WARN", "BLOCK"], `${label}.status`),
    baseSha: asNullableString(record.baseSha, `${label}.baseSha`),
    headSha: asNullableString(record.headSha, `${label}.headSha`),
    branch: asNullableString(record.branch, `${label}.branch`),
    author: asNullableString(record.author, `${label}.author`),
    commitMessage: asNullableString(record.commitMessage, `${label}.commitMessage`),
    warningCount: asFiniteNumber(record.warningCount, `${label}.warningCount`),
    architectureScore: asScore(record.architectureScore, `${label}.architectureScore`),
    intentScore: asScore(record.intentScore, `${label}.intentScore`),
    graphSnapshot: parseGraphSnapshot(record.graphSnapshot, `${label}.graphSnapshot`),
    validatedAt: asTimestamp(record.validatedAt, `${label}.validatedAt`),
    createdAt: asTimestamp(record.createdAt, `${label}.createdAt`),
  };
};

const parseEvidence = (value: unknown, label: string): DashboardEvidence => {
  const record = asRecord(value, label);
  const line = record.line;
  const column = record.column;

  return {
    kind: asNonEmptyString(record.kind, `${label}.kind`),
    file: asNonEmptyString(record.file, `${label}.file`),
    ...(line === undefined || line === null
      ? {}
      : { line: asFiniteNumber(line, `${label}.line`) }),
    ...(column === undefined || column === null
      ? {}
      : { column: asFiniteNumber(column, `${label}.column`) }),
    excerpt: asNonEmptyString(record.excerpt, `${label}.excerpt`),
  };
};

const parseJsonObject = (value: unknown, label: string): Readonly<JsonRecord> =>
  asRecord(value, label);

const parseViolation = (value: unknown, label: string): DashboardViolation => {
  const record = asRecord(value, label);

  return {
    id: asNonEmptyString(record.id, `${label}.id`),
    fingerprint: asNonEmptyString(record.fingerprint, `${label}.fingerprint`),
    type: asNonEmptyString(record.type, `${label}.type`),
    severity: isOneOf(
      record.severity,
      ["low", "medium", "high", "critical"],
      `${label}.severity`,
    ),
    enforcement: isOneOf(
      record.enforcement,
      ["report", "warn", "block_merge"],
      `${label}.enforcement`,
    ),
    status: isOneOf(
      record.status,
      ["active", "resolved", "blocked"],
      `${label}.status`,
    ),
    title: asNonEmptyString(record.title, `${label}.title`),
    message: asNonEmptyString(record.message, `${label}.message`),
    affectedFiles: asStringArray(record.affectedFiles, `${label}.affectedFiles`),
    evidence: asArray(record.evidence, `${label}.evidence`).map((item, index) =>
      parseEvidence(item, `${label}.evidence[${index}]`),
    ),
    details: parseJsonObject(record.details, `${label}.details`),
    healthImpact: parseJsonObject(record.healthImpact, `${label}.healthImpact`),
    firstSeenAt: asTimestamp(record.firstSeenAt, `${label}.firstSeenAt`),
    lastSeenAt: asTimestamp(record.lastSeenAt, `${label}.lastSeenAt`),
    resolvedAt: record.resolvedAt === null || record.resolvedAt === undefined
      ? null
      : asTimestamp(record.resolvedAt, `${label}.resolvedAt`),
    tenetName: asNullableString(record.tenetName, `${label}.tenetName`),
    tenetExternalId: asNullableString(record.tenetExternalId, `${label}.tenetExternalId`),
  };
};

const parseTenet = (value: unknown, label: string): DashboardTenet => {
  const record = asRecord(value, label);

  return {
    id: asNonEmptyString(record.id, `${label}.id`),
    externalId: asNonEmptyString(record.externalId, `${label}.externalId`),
    name: asNonEmptyString(record.name, `${label}.name`),
    description: asNonEmptyString(record.description, `${label}.description`),
    type: isOneOf(record.type, ["architecture", "business"], `${label}.type`),
    severity: isOneOf(
      record.severity,
      ["low", "medium", "high", "critical"],
      `${label}.severity`,
    ),
    enforcement: isOneOf(
      record.enforcement,
      ["report", "warn", "block_merge"],
      `${label}.enforcement`,
    ),
    status: isOneOf(
      record.status,
      ["draft", "active", "disabled"],
      `${label}.status`,
    ),
    scope: asStringArray(record.scope, `${label}.scope`),
    constraint: parseJsonObject(record.constraint, `${label}.constraint`),
    updatedAt: asTimestamp(record.updatedAt, `${label}.updatedAt`),
  };
};

const parseLatestHealth = (value: unknown, label: string): DashboardLatestHealth | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const record = asRecord(value, label);
  return {
    validationRunId: asNonEmptyString(record.validationRunId, `${label}.validationRunId`),
    architectureScore: asScore(record.architectureScore, `${label}.architectureScore`),
    intentScore: asScore(record.intentScore, `${label}.intentScore`),
    validatedAt: asTimestamp(record.validatedAt, `${label}.validatedAt`),
  };
};

const sortChronologically = <T extends { readonly validatedAt: string; readonly id?: string }>(
  values: readonly T[],
): readonly T[] =>
  [...values].sort((left, right) => {
    const byTime = Date.parse(left.validatedAt) - Date.parse(right.validatedAt);
    if (byTime !== 0) {
      return byTime;
    }

    return (left.id ?? "").localeCompare(right.id ?? "");
  });

const assertMatchingRepository = (
  value: unknown,
  expected: DashboardRepository,
  label: string,
): void => {
  const repository = parseRepository(value, `${label}.repository`);
  if (repository.id !== expected.id || repository.slug !== expected.slug) {
    throw new DashboardDataError(`${label} is for a different repository.`);
  }
};

/**
 * Validates the actual read-API JSON and produces chronological view data.
 * It intentionally rejects a malformed response rather than giving the UI a
 * plausible-looking hard-coded fallback.
 */
export const parseDashboardData = (
  payloads: DashboardApiPayloads,
): DashboardDataParseResult => {
  try {
    const summaryRecord = asRecord(payloads.summary, "repository summary");
    const summary: DashboardRepositorySummary = {
      repository: parseRepository(summaryRecord.repository, "repository summary.repository"),
      latestHealth: parseLatestHealth(
        summaryRecord.latestHealth,
        "repository summary.latestHealth",
      ),
      activeViolationCount: asFiniteNumber(
        summaryRecord.activeViolationCount,
        "repository summary.activeViolationCount",
      ),
    };

    const validationRunsRecord = asRecord(payloads.validationRuns, "validation runs");
    assertMatchingRepository(validationRunsRecord.repository, summary.repository, "validation runs");
    const runs = sortChronologically(
      asArray(validationRunsRecord.runs, "validation runs.runs").map((item, index) =>
        parseValidationRun(item, `validation runs.runs[${index}]`),
      ),
    );

    const violationsRecord = asRecord(payloads.violations, "violations");
    assertMatchingRepository(violationsRecord.repository, summary.repository, "violations");
    const violations = asArray(violationsRecord.violations, "violations.violations").map(
      (item, index) => parseViolation(item, `violations.violations[${index}]`),
    );

    const healthRecord = asRecord(payloads.health, "health history");
    assertMatchingRepository(healthRecord.repository, summary.repository, "health history");
    const healthSnapshots = sortChronologically(
      asArray(healthRecord.snapshots, "health history.snapshots").map((item, index) =>
        parseHealthSnapshot(item, `health history.snapshots[${index}]`),
      ),
    );

    const tenetsRecord = asRecord(payloads.tenets, "tenets");
    assertMatchingRepository(tenetsRecord.repository, summary.repository, "tenets");
    const tenets = asArray(tenetsRecord.tenets, "tenets.tenets").map((item, index) =>
      parseTenet(item, `tenets.tenets[${index}]`),
    );

    return {
      ok: true,
      data: {
        summary,
        repository: summary.repository,
        latestHealth: summary.latestHealth,
        activeViolationCount: summary.activeViolationCount,
        runs,
        healthSnapshots,
        snapshots: healthSnapshots,
        violations,
        tenets,
      },
    };
  } catch (error: unknown) {
    return {
      ok: false,
      error:
        error instanceof DashboardDataError
          ? error.message
          : "The control plane returned an unreadable response.",
    };
  }
};

export interface DashboardLoadOptions {
  readonly repositoryId: string;
  readonly fetcher?: DashboardFetcher;
  readonly signal?: AbortSignal;
}

export type DashboardFetcher = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export const dashboardApiUrls = (repositoryId: string) => {
  const escapedRepositoryId = encodeURIComponent(repositoryId);
  const base = `/api/repositories/${escapedRepositoryId}`;

  return {
    summary: base,
    validationRuns: `${base}/validation-runs`,
    violations: `${base}/violations`,
    health: `${base}/health`,
    tenets: `${base}/tenets`,
  } as const;
};

const parseResponse = async (response: Response, label: string): Promise<unknown> => {
  if (!response.ok) {
    throw new DashboardDataError(
      `${label} could not be loaded (${response.status} ${response.statusText}).`,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new DashboardDataError(`${label} returned invalid JSON.`);
  }
};

/** Fetches the real repository APIs in parallel; it never supplies fixture data. */
export const loadDashboardData = async ({
  repositoryId,
  fetcher = globalThis.fetch,
  signal,
}: DashboardLoadOptions): Promise<DashboardData> => {
  if (repositoryId.trim().length === 0) {
    throw new DashboardDataError("A repository identifier is required.");
  }

  const urls = dashboardApiUrls(repositoryId);
  const init: RequestInit = {
    headers: { accept: "application/json" },
    ...(signal === undefined ? {} : { signal }),
  };
  const [summary, validationRuns, violations, health, tenets] = await Promise.all([
    fetcher(urls.summary, init),
    fetcher(urls.validationRuns, init),
    fetcher(urls.violations, init),
    fetcher(urls.health, init),
    fetcher(urls.tenets, init),
  ]);
  const payloads: DashboardApiPayloads = {
    summary: await parseResponse(summary, "Repository summary"),
    validationRuns: await parseResponse(validationRuns, "Validation history"),
    violations: await parseResponse(violations, "Violations"),
    health: await parseResponse(health, "Health history"),
    tenets: await parseResponse(tenets, "Tenets"),
  };
  const parsed = parseDashboardData(payloads);

  if (!parsed.ok) {
    throw new DashboardDataError(parsed.error);
  }

  return parsed.data;
};

export type DashboardHealthDimension = "architecture" | "intent";

export interface DashboardHealthPoint {
  readonly validationRunId: string;
  readonly score: number;
  readonly validatedAt: string;
}

/** Combined chart points keep both independently-engine-produced scores aligned. */
export interface DashboardHealthChartPoint {
  readonly label: string;
  readonly validationRunId: string;
  readonly architectureScore: number;
  readonly intentScore: number;
  readonly validatedAt: string;
}

export interface DashboardCurrentHealth {
  readonly score: number;
  readonly previousScore: number | null;
  readonly delta: number | null;
  readonly validatedAt: string;
  readonly validationRunId: string;
}

export const healthSeriesFor = (
  data: Pick<DashboardData, "healthSnapshots">,
  dimension: DashboardHealthDimension,
): readonly DashboardHealthPoint[] =>
  data.healthSnapshots.map((snapshot) => ({
    validationRunId: snapshot.validationRunId,
    score:
      dimension === "architecture"
        ? snapshot.architectureScore
        : snapshot.intentScore,
    validatedAt: snapshot.validatedAt,
  }));

export const healthChartSeriesFor = (
  data: Pick<DashboardData, "healthSnapshots">,
): readonly DashboardHealthChartPoint[] =>
  data.healthSnapshots.map((snapshot, index) => ({
    label: `Run ${index + 1}`,
    validationRunId: snapshot.validationRunId,
    architectureScore: snapshot.architectureScore,
    intentScore: snapshot.intentScore,
    validatedAt: snapshot.validatedAt,
  }));

/** Latest engine-produced score and its immediate persisted predecessor. */
export const currentHealthFor = (
  data: Pick<DashboardData, "healthSnapshots" | "summary">,
  dimension: DashboardHealthDimension,
): DashboardCurrentHealth | null => {
  const series = healthSeriesFor(data, dimension);
  const latest = series.at(-1);

  if (latest) {
    const previous = series.at(-2);
    return {
      score: latest.score,
      previousScore: previous?.score ?? null,
      delta: previous === undefined ? null : latest.score - previous.score,
      validatedAt: latest.validatedAt,
      validationRunId: latest.validationRunId,
    };
  }

  const latestHealth = data.summary.latestHealth;
  if (!latestHealth) {
    return null;
  }

  return {
    score:
      dimension === "architecture"
        ? latestHealth.architectureScore
        : latestHealth.intentScore,
    previousScore: null,
    delta: null,
    validatedAt: latestHealth.validatedAt,
    validationRunId: latestHealth.validationRunId,
  };
};

export type DashboardViolationFilter = "all" | "active" | "resolved";

/** The Active tab includes both active and currently-blocked lifecycle states. */
export const filterViolations = (
  violations: readonly DashboardViolation[],
  filter: DashboardViolationFilter,
): readonly DashboardViolation[] => {
  if (filter === "all") {
    return violations;
  }

  if (filter === "resolved") {
    return violations.filter((violation) => violation.status === "resolved");
  }

  return violations.filter((violation) => violation.status !== "resolved");
};

const timestampsMatch = (left: string, right: string): boolean =>
  Math.abs(Date.parse(left) - Date.parse(right)) <= 1_000;

const observedViolationTypes = (
  run: DashboardValidationRun,
  violations: readonly DashboardViolation[],
): readonly string[] =>
  violations
    .filter((violation) => timestampsMatch(violation.firstSeenAt, run.validatedAt))
    .map((violation) => violation.type);

export type DashboardActivityKind =
  | "compliant"
  | "warning"
  | "blocked"
  | "architecture_drift"
  | "semantic_conflict"
  | "architecture_restored"
  | "intent_restored";

export interface DashboardActivity {
  readonly run: DashboardValidationRun;
  readonly kind: DashboardActivityKind;
  readonly label: string;
  readonly detail: string;
  readonly architectureDelta: number | null;
  readonly intentDelta: number | null;
  readonly observedViolationTypes: readonly string[];
}

/**
 * Creates a truthful activity label from persisted status, score transitions,
 * and violation lifecycle timestamps. It deliberately does not invent commit,
 * author, or branch metadata.
 */
export const activityForRuns = (
  runs: readonly DashboardValidationRun[],
  violations: readonly DashboardViolation[],
): readonly DashboardActivity[] => {
  const chronologicalRuns = sortChronologically(runs);

  return chronologicalRuns.map((run, index) => {
    const previous = chronologicalRuns[index - 1];
    const architectureDelta =
      previous === undefined ? null : run.architectureScore - previous.architectureScore;
    const intentDelta =
      previous === undefined ? null : run.intentScore - previous.intentScore;
    const violationTypes = observedViolationTypes(run, violations);

    if (run.status === "BLOCK") {
      if (violationTypes.includes("architecture") || architectureDelta !== null && architectureDelta < 0) {
        return {
          run,
          kind: "architecture_drift",
          label: "Architectural drift detected",
          detail: "A deterministic architecture Tenet blocked this validation.",
          architectureDelta,
          intentDelta,
          observedViolationTypes: violationTypes,
        };
      }

      if (violationTypes.includes("semantic") || intentDelta !== null && intentDelta < 0) {
        return {
          run,
          kind: "semantic_conflict",
          label: "Semantic conflict detected",
          detail: "A deterministic business Tenet blocked this validation.",
          architectureDelta,
          intentDelta,
          observedViolationTypes: violationTypes,
        };
      }

      return {
        run,
        kind: "blocked",
        label: "Validation blocked",
        detail: "A deterministic Tenet blocked this validation.",
        architectureDelta,
        intentDelta,
        observedViolationTypes: violationTypes,
      };
    }

    if (run.status === "WARN") {
      return {
        run,
        kind: "warning",
        label: "Validation completed with warnings",
        detail: "No blocking deterministic violation was recorded.",
        architectureDelta,
        intentDelta,
        observedViolationTypes: violationTypes,
      };
    }

    if (architectureDelta !== null && architectureDelta > 0) {
      return {
        run,
        kind: "architecture_restored",
        label: "Architecture restored",
        detail: "Architecture Health improved in this persisted validation.",
        architectureDelta,
        intentDelta,
        observedViolationTypes: violationTypes,
      };
    }

    if (intentDelta !== null && intentDelta > 0) {
      return {
        run,
        kind: "intent_restored",
        label: "Intent restored",
        detail: "Intent Health improved in this persisted validation.",
        architectureDelta,
        intentDelta,
        observedViolationTypes: violationTypes,
      };
    }

    return {
      run,
      kind: "compliant",
      label: "Repository compliant",
      detail: "All evaluated deterministic Tenets passed.",
      architectureDelta,
      intentDelta,
      observedViolationTypes: violationTypes,
    };
  });
};

export interface DashboardViolationCounts {
  readonly total: number;
  readonly active: number;
  readonly resolved: number;
  readonly byType: Readonly<Record<string, number>>;
}

export const violationCounts = (
  violations: readonly DashboardViolation[],
): DashboardViolationCounts => {
  const byType: Record<string, number> = {};
  for (const violation of violations) {
    byType[violation.type] = (byType[violation.type] ?? 0) + 1;
  }

  return {
    total: violations.length,
    active: filterViolations(violations, "active").length,
    resolved: filterViolations(violations, "resolved").length,
    byType,
  };
};
