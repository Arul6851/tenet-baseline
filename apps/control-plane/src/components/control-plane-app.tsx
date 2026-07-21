"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  DeveloperExplanationSchema,
  IntentProposalSchema,
  type DeveloperExplanation,
  type IntentProposal,
} from "@tenet/contracts";

import {
  ArchitectureGraph,
  type ArchitectureGraphEdge,
  type ArchitectureGraphNode,
} from "./architecture-graph";
import {
  HealthChart,
  type HealthChartPoint,
} from "./health-chart";
import {
  ProductShell,
  type ControlPlanePage,
} from "./product-shell";
import {
  activityForRuns as activityForPersistedRuns,
  currentHealthFor,
  healthChartSeriesFor,
  loadDashboardData,
  type DashboardData as PersistedDashboardData,
} from "../lib/dashboard-data";

const repositorySlug = "commerce-platform";

type JsonRecord = Record<string, unknown>;
type ViolationFilter = "all" | "active" | "resolved";

interface RepositoryRecord {
  id: string;
  slug: string;
  name: string;
  displayName: string;
  defaultBranch: string;
  createdAt?: string | undefined;
  updatedAt?: string | undefined;
}

interface HealthSnapshot {
  validationRunId: string;
  architectureScore: number;
  intentScore: number;
  validatedAt: string;
  architectureBreakdown: unknown[];
  intentBreakdown: unknown[];
}

interface GraphNode {
  id: string;
  label?: string | undefined;
  paths: string[];
}

interface GraphEdge {
  sourceModule: string;
  targetModule: string;
  importKind: "runtime" | "type" | "dynamic";
  sourceFile?: string | undefined;
  targetFile?: string | undefined;
  importSpecifier?: string | undefined;
  line?: number | undefined;
  column?: number | undefined;
}

interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
  intendedArchitecture: {
    modules: GraphNode[];
    intendedEdges: Array<[string, string]>;
    allowedEdges: Array<[string, string]>;
  };
}

interface ValidationRun {
  id: string;
  ingestionKey: string;
  source: string;
  status: "PASS" | "WARN" | "BLOCK";
  baseSha?: string | undefined;
  headSha?: string | undefined;
  branch?: string | undefined;
  author?: string | undefined;
  commitMessage?: string | undefined;
  warningCount: number;
  architectureScore: number;
  intentScore: number;
  graphSnapshot: GraphSnapshot;
  validatedAt: string;
  createdAt: string;
}

interface ReadEvidence {
  kind?: string | undefined;
  file?: string | undefined;
  line?: number | undefined;
  column?: number | undefined;
  excerpt?: string | undefined;
}

interface ReadViolation {
  id: string;
  fingerprint: string;
  type: "architecture" | "semantic" | "intent" | string;
  severity: string;
  enforcement: string;
  status: "active" | "resolved" | "blocked" | string;
  title: string;
  message: string;
  affectedFiles: string[];
  evidence: ReadEvidence[];
  details: JsonRecord;
  healthImpact: JsonRecord;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt?: string | null;
  tenetName?: string | null;
  tenetExternalId?: string | null;
}

interface ReadTenet {
  id: string;
  externalId: string;
  name: string;
  description: string;
  type: "architecture" | "business" | string;
  severity: string;
  enforcement: string;
  status: "draft" | "active" | "disabled" | string;
  scope: string[];
  constraint: JsonRecord;
  updatedAt: string;
}

interface DashboardViewData {
  source: PersistedDashboardData;
  repository: RepositoryRecord;
  latestHealth: HealthSnapshot | null;
  activeViolationCount: number;
  snapshots: HealthSnapshot[];
  runs: ValidationRun[];
  violations: ReadViolation[];
  tenets: ReadTenet[];
  aiConfigured: boolean;
}

interface ActivityItem {
  id: string;
  status: ValidationRun["status"];
  title: string;
  detail: string;
  tenet?: string | undefined;
  validatedAt: string;
  architectureScore: number;
  intentScore: number;
  branch?: string | undefined;
  headSha?: string | undefined;
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asString = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const asOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const asNumber = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asStringArray = (value: unknown): string[] =>
  asArray(value).filter((item): item is string => typeof item === "string");

const parseRepository = (value: unknown): RepositoryRecord => {
  if (!isRecord(value)) {
    throw new Error("The control plane returned an invalid repository record.");
  }

  const id = asString(value.id);
  const slug = asString(value.slug);
  const name = asString(value.name);
  const displayName = asString(value.displayName);
  const defaultBranch = asString(value.defaultBranch, "main");
  if (!id || !slug || !name || !displayName) {
    throw new Error("The control plane repository record is incomplete.");
  }

  return {
    id,
    slug,
    name,
    displayName,
    defaultBranch,
    createdAt: asOptionalString(value.createdAt),
    updatedAt: asOptionalString(value.updatedAt),
  };
};

const parseHealthSnapshot = (value: unknown): HealthSnapshot => {
  if (!isRecord(value)) {
    throw new Error("The control plane returned an invalid health snapshot.");
  }

  const validationRunId = asString(value.validationRunId);
  const validatedAt = asString(value.validatedAt);
  if (!validationRunId || !validatedAt) {
    throw new Error("The control plane health snapshot is incomplete.");
  }

  return {
    validationRunId,
    architectureScore: asNumber(value.architectureScore),
    intentScore: asNumber(value.intentScore),
    validatedAt,
    architectureBreakdown: asArray(value.architectureBreakdown),
    intentBreakdown: asArray(value.intentBreakdown),
  };
};

const parseGraphNode = (value: unknown): GraphNode | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = asString(value.id);
  if (!id) {
    return undefined;
  }
  return {
    id,
    label: asOptionalString(value.label),
    paths: asStringArray(value.paths),
  };
};

const parseGraphEdge = (value: unknown): GraphEdge | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const sourceModule = asString(value.sourceModule);
  const targetModule = asString(value.targetModule);
  const importKind = asString(value.importKind);
  if (
    !sourceModule ||
    !targetModule ||
    (importKind !== "runtime" && importKind !== "type" && importKind !== "dynamic")
  ) {
    return undefined;
  }
  return {
    sourceModule,
    targetModule,
    importKind,
    sourceFile: asOptionalString(value.sourceFile),
    targetFile: asOptionalString(value.targetFile),
    importSpecifier: asOptionalString(value.importSpecifier),
    line: typeof value.line === "number" ? value.line : undefined,
    column: typeof value.column === "number" ? value.column : undefined,
  };
};

const parseEdgeTuple = (value: unknown): [string, string] | undefined => {
  if (Array.isArray(value) && value.length === 2) {
    const source = asString(value[0]);
    const target = asString(value[1]);
    return source && target ? [source, target] : undefined;
  }
  if (!isRecord(value)) {
    return undefined;
  }
  const source = asString(value.sourceModule);
  const target = asString(value.targetModule);
  return source && target ? [source, target] : undefined;
};

const parseGraphSnapshot = (value: unknown): GraphSnapshot => {
  const record = isRecord(value) ? value : {};
  const intended = isRecord(record.intendedArchitecture)
    ? record.intendedArchitecture
    : {};
  return {
    nodes: asArray(record.nodes)
      .map(parseGraphNode)
      .filter((item): item is GraphNode => item !== undefined),
    edges: asArray(record.edges)
      .map(parseGraphEdge)
      .filter((item): item is GraphEdge => item !== undefined),
    intendedArchitecture: {
      modules: asArray(intended.modules)
        .map(parseGraphNode)
        .filter((item): item is GraphNode => item !== undefined),
      intendedEdges: asArray(intended.intendedEdges)
        .map(parseEdgeTuple)
        .filter((item): item is [string, string] => item !== undefined),
      allowedEdges: asArray(intended.allowedEdges)
        .map(parseEdgeTuple)
        .filter((item): item is [string, string] => item !== undefined),
    },
  };
};

const parseValidationRun = (value: unknown): ValidationRun | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = asString(value.id);
  const validatedAt = asString(value.validatedAt);
  const status = asString(value.status);
  if (
    !id ||
    !validatedAt ||
    (status !== "PASS" && status !== "WARN" && status !== "BLOCK")
  ) {
    return undefined;
  }
  return {
    id,
    ingestionKey: asString(value.ingestionKey),
    source: asString(value.source, "cli"),
    status,
    baseSha: asOptionalString(value.baseSha),
    headSha: asOptionalString(value.headSha),
    branch: asOptionalString(value.branch),
    author: asOptionalString(value.author),
    commitMessage: asOptionalString(value.commitMessage),
    warningCount: asNumber(value.warningCount),
    architectureScore: asNumber(value.architectureScore),
    intentScore: asNumber(value.intentScore),
    graphSnapshot: parseGraphSnapshot(value.graphSnapshot),
    validatedAt,
    createdAt: asString(value.createdAt, validatedAt),
  };
};

const parseEvidence = (value: unknown): ReadEvidence | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const excerpt = asOptionalString(value.excerpt);
  const file = asOptionalString(value.file);
  if (!excerpt && !file) {
    return undefined;
  }
  return {
    kind: asOptionalString(value.kind),
    file,
    line: typeof value.line === "number" ? value.line : undefined,
    column: typeof value.column === "number" ? value.column : undefined,
    excerpt,
  };
};

const parseViolation = (value: unknown): ReadViolation | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = asString(value.id);
  const fingerprint = asString(value.fingerprint);
  if (!id || !fingerprint) {
    return undefined;
  }
  return {
    id,
    fingerprint,
    type: asString(value.type, "intent"),
    severity: asString(value.severity, "medium"),
    enforcement: asString(value.enforcement, "warn"),
    status: asString(value.status, "active"),
    title: asString(value.title, "Untitled violation"),
    message: asString(value.message, "No deterministic message was persisted."),
    affectedFiles: asStringArray(value.affectedFiles),
    evidence: asArray(value.evidence)
      .map(parseEvidence)
      .filter((item): item is ReadEvidence => item !== undefined),
    details: isRecord(value.details) ? value.details : {},
    healthImpact: isRecord(value.healthImpact) ? value.healthImpact : {},
    firstSeenAt: asString(value.firstSeenAt),
    lastSeenAt: asString(value.lastSeenAt),
    resolvedAt: asOptionalString(value.resolvedAt) ?? null,
    tenetName: asOptionalString(value.tenetName) ?? null,
    tenetExternalId: asOptionalString(value.tenetExternalId) ?? null,
  };
};

const parseTenet = (value: unknown): ReadTenet | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = asString(value.id);
  const externalId = asString(value.externalId);
  if (!id || !externalId) {
    return undefined;
  }
  return {
    id,
    externalId,
    name: asString(value.name, "Untitled Tenet"),
    description: asString(value.description),
    type: asString(value.type, "business"),
    severity: asString(value.severity, "medium"),
    enforcement: asString(value.enforcement, "warn"),
    status: asString(value.status, "draft"),
    scope: asStringArray(value.scope),
    constraint: isRecord(value.constraint) ? value.constraint : {},
    updatedAt: asString(value.updatedAt),
  };
};

const postJson = async (path: string, payload?: unknown): Promise<unknown> => {
  const response = await fetch(path, {
    method: "POST",
    ...(payload === undefined
      ? {}
      : { headers: { "content-type": "application/json" } }),
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = isRecord(body) ? asOptionalString(body.error) : undefined;
    throw new Error(error ?? `Request failed (${response.status}).`);
  }
  return body;
};

/**
 * The shared mapper validates all five database-backed read APIs before this
 * presentation adapter shapes them for the React views. It never fetches or
 * accepts raw endpoint JSON itself.
 */
const toDashboardViewData = (
  source: PersistedDashboardData,
  aiConfigured: boolean,
): DashboardViewData => {
  const latestHealth = source.latestHealth
    ? parseHealthSnapshot({
        ...source.latestHealth,
        architectureBreakdown: [],
        intentBreakdown: [],
      })
    : null;
  return {
    source,
    repository: parseRepository(source.repository),
    latestHealth,
    activeViolationCount: source.activeViolationCount,
    snapshots: source.snapshots.map(parseHealthSnapshot),
    runs: source.runs
      .map(parseValidationRun)
      .filter((item): item is ValidationRun => item !== undefined),
    violations: source.violations
      .map(parseViolation)
      .filter((item): item is ReadViolation => item !== undefined),
    tenets: source.tenets
      .map(parseTenet)
      .filter((item): item is ReadTenet => item !== undefined),
    aiConfigured,
  };
};

const readAiAvailability = async (): Promise<boolean> => {
  const response = await fetch("/api/health", { cache: "no-store" });
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    throw new Error(`Control-plane health check failed (${response.status}).`);
  }
  return isRecord(body) && isRecord(body.ai) && body.ai.configured === true;
};

const dateValue = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const chronological = <T extends { validatedAt: string }>(items: readonly T[]): T[] =>
  [...items].sort((left, right) => dateValue(left.validatedAt) - dateValue(right.validatedAt));

const formatDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value || "Not recorded";
  }
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
};

const shortSha = (sha: string | undefined): string | undefined =>
  sha ? sha.slice(0, 8) : undefined;

const humanize = (value: string): string =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

const graphEdgeKey = (source: string, target: string): string => `${source}->${target}`;

const graphNodes = (
  snapshot: GraphSnapshot,
  intended = false,
  displayedEdges: readonly ArchitectureGraphEdge[] = [],
): ArchitectureGraphNode[] => {
  const availableNodes = intended
    ? snapshot.intendedArchitecture.modules
    : snapshot.nodes.length > 0
      ? snapshot.nodes
      : snapshot.intendedArchitecture.modules;
  const connectedNodeIds = new Set(
    displayedEdges.flatMap((edge) => [edge.sourceModule, edge.targetModule]),
  );
  // Graph snapshots can include repository modules that have no relationship to
  // the architecture being displayed. Keep the visualization focused on the
  // declared or observed routes, while preserving all normalized edges below.
  const nodes =
    connectedNodeIds.size > 0
      ? availableNodes.filter((node) => connectedNodeIds.has(node.id))
      : availableNodes;
  return nodes.map((node) => ({
    id: node.id,
    ...(node.label === undefined ? {} : { label: node.label }),
  }));
};

const graphEdges = (
  snapshot: GraphSnapshot,
  intended = false,
  unauthorizedKeys: ReadonlySet<string> = new Set(),
): ArchitectureGraphEdge[] => {
  const edges = intended
    ? snapshot.intendedArchitecture.intendedEdges.map(([sourceModule, targetModule]) => ({
        sourceModule,
        targetModule,
      }))
    : snapshot.edges.filter((edge) => edge.importKind === "runtime");
  return edges.map((edge) => ({
    sourceModule: edge.sourceModule,
    targetModule: edge.targetModule,
    unauthorized:
      !intended && unauthorizedKeys.has(graphEdgeKey(edge.sourceModule, edge.targetModule)),
  }));
};

const healthSeries = (data: DashboardViewData): HealthChartPoint[] =>
  [...healthChartSeriesFor(data.source)];

const scoreDelta = (
  data: DashboardViewData,
  metric: "architectureScore" | "intentScore",
): number =>
  currentHealthFor(
    data.source,
    metric === "architectureScore" ? "architecture" : "intent",
  )?.delta ?? 0;

const activityForRuns = (data: DashboardViewData): ActivityItem[] =>
  activityForPersistedRuns(data.source.runs, data.source.violations)
    .map((activity) => {
      const linkedViolation = activity.observedViolationTypes
        .map((type) => data.violations.find((violation) => violation.type === type))
        .find((violation) => violation !== undefined);
      return {
        id: activity.run.id,
        status: activity.run.status,
        title: activity.label,
        detail: activity.detail,
        ...(linkedViolation?.tenetName === null || linkedViolation?.tenetName === undefined
          ? {}
          : { tenet: linkedViolation.tenetName }),
        validatedAt: activity.run.validatedAt,
        architectureScore: activity.run.architectureScore,
        intentScore: activity.run.intentScore,
        ...(activity.run.branch === null ? {} : { branch: activity.run.branch }),
        ...(activity.run.headSha === null ? {} : { headSha: activity.run.headSha }),
      };
    })
    .reverse();

const statusClass = (status: string): string => status.toLowerCase();

const scoreState = (score: number): "good" | "warn" | "block" => {
  if (score >= 100) {
    return "good";
  }
  return score === 0 ? "block" : "warn";
};

const jsonForDisplay = (value: JsonRecord): string => JSON.stringify(value, null, 2);

const architectureDetailsFor = (value: JsonRecord): JsonRecord =>
  isRecord(value.architecture) ? value.architecture : {};

const semanticDetailsFor = (value: JsonRecord): JsonRecord =>
  isRecord(value.semantic) ? value.semantic : {};

const healthDeductionTotal = (value: unknown): number =>
  asArray(value)
    .filter(isRecord)
    .reduce((total, deduction) => total + asNumber(deduction.amount), 0);

const PageHeader = ({
  kicker,
  title,
  description,
  children,
}: {
  kicker: string;
  title: string;
  description: string;
  children?: ReactNode;
}) => (
  <header className="page-header">
    <div className="page-header-copy">
      <p className="eyebrow">{kicker}</p>
      <h1 className="page-title">{title}</h1>
      <p className="page-description">{description}</p>
    </div>
    {children ? <div className="page-actions">{children}</div> : null}
  </header>
);

const StatusBadge = ({ status }: { status: string }) => (
  <span className={`status-badge ${statusClass(status)}`}>
    <span aria-hidden="true">{status === "PASS" ? "✓" : status === "BLOCK" ? "!" : "•"}</span>
    {status}
  </span>
);

const LifecycleBadge = ({ status }: { status: string }) => (
  <span className={`lifecycle-badge ${statusClass(status)}`}>{status}</span>
);

const LoadingState = ({ page }: { page: ControlPlanePage }) => (
  <ProductShell activePage={page} connectionState="loading">
    <div
      className="dashboard-page dashboard-page--loading skeleton-page"
      aria-label="Loading persisted control-plane data"
      role="status"
    >
      <div className="skeleton-line short" />
      <div className="skeleton-line" />
      <div className="skeleton-grid">
        <div className="skeleton-card" />
        <div className="skeleton-card" />
        <div className="skeleton-card" />
      </div>
      <div className="skeleton-card skeleton-large" />
    </div>
  </ProductShell>
);

const ErrorState = ({
  page,
  error,
  onRetry,
}: {
  page: ControlPlanePage;
  error: string;
  onRetry: () => void;
}) => (
  <ProductShell activePage={page} connectionState="error">
    <section
      className="dashboard-page dashboard-page--error error-state"
      aria-labelledby="control-plane-error-title"
    >
      <div className="error-state-content">
        <div aria-hidden="true" className="state-symbol">!</div>
        <p className="eyebrow">Operational status</p>
        <h1 id="control-plane-error-title">Control plane data is unavailable</h1>
        <p>
          Tenet did not substitute dashboard data. Check the control-plane connection and
          PostgreSQL configuration, then try again.
        </p>
        <p className="form-error">{error}</p>
        <button className="button button-primary" onClick={onRetry} type="button">
          Retry connection
        </button>
      </div>
    </section>
  </ProductShell>
);

export function ControlPlaneApp({ page }: { page: ControlPlanePage }) {
  const [data, setData] = useState<DashboardViewData>();
  const [error, setError] = useState<string>();
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(undefined);
    try {
      const [persistedData, aiConfigured] = await Promise.all([
        loadDashboardData({ repositoryId: repositorySlug }),
        readAiAvailability(),
      ]);
      setData(toDashboardViewData(persistedData, aiConfigured));
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "An unknown control-plane error occurred.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading && !data) {
    return <LoadingState page={page} />;
  }
  if (!data) {
    return <ErrorState page={page} error={error ?? "Unable to load the control plane."} onRetry={() => void load()} />;
  }

  return (
    <ProductShell
      activePage={page}
      connectionState={error ? "error" : "connected"}
      repositoryName={data.repository.name}
      repositorySlug={data.repository.slug}
    >
      <DashboardPage data={data} page={page} onRefresh={() => void load()} />
    </ProductShell>
  );
}

const DashboardPage = ({
  data,
  page,
  onRefresh,
}: {
  data: DashboardViewData;
  page: ControlPlanePage;
  onRefresh: () => void;
}) => {
  let content: ReactNode;

  switch (page) {
    case "architecture":
      content = <ArchitecturePage data={data} />;
      break;
    case "tenets":
      content = <TenetsPage data={data} onRefresh={onRefresh} />;
      break;
    case "violations":
      content = <ViolationsPage data={data} />;
      break;
    case "changes":
      content = <ChangesPage data={data} />;
      break;
    case "analytics":
      content = <AnalyticsPage data={data} />;
      break;
    default:
      content = <OverviewPage data={data} />;
      break;
  }

  return (
    <div className={`dashboard-page dashboard-page--${page}`} key={page}>
      {content}
    </div>
  );
};

const MetricCard = ({
  label,
  score,
  delta,
  kind,
  note,
}: {
  label: string;
  score: number;
  delta: number;
  kind: "architecture" | "intent";
  note: string;
}) => {
  const state = scoreState(score);
  const deltaLabel =
    delta === 0 ? "No change from the prior run" : `${delta > 0 ? "+" : ""}${delta} from the prior run`;
  return (
    <article className={`metric-card motion-card ${kind}`}>
      <div className="metric-heading">
        <span className="metric-label">{label}</span>
        <span className={`metric-status ${state}`}>{state === "good" ? "Compliant" : state === "block" ? "Blocked" : "At risk"}</span>
      </div>
      <div className="metric-value-row">
        <strong className="metric-value">{score}</strong>
        <span className="metric-denominator">/100</span>
      </div>
      <div className={`metric-change ${delta > 0 ? "positive" : delta < 0 ? "negative" : "neutral"}`}>
        <span aria-hidden="true">{delta > 0 ? "↑" : delta < 0 ? "↓" : "—"}</span>
        <span>{deltaLabel}</span>
      </div>
      <div className="metric-footer">
        <p className="metric-footnote">{note}</p>
      </div>
    </article>
  );
};

const ActivityTimeline = ({ activities }: { activities: readonly ActivityItem[] }) => (
  <ol className="timeline">
    {activities.map((activity, index) => (
      <li
        className="timeline-item motion-row"
        key={activity.id}
        style={{ animationDelay: `${Math.min(index, 7) * 55}ms` }}
      >
        <span aria-hidden="true" className={`timeline-marker ${statusClass(activity.status)}`} />
        <div className="timeline-content">
          <div className="timeline-heading">
            <StatusBadge status={activity.status} />
            <strong>{activity.title}</strong>
          </div>
          <p>{activity.detail}</p>
          <div className="timeline-meta">
            <span>{formatDate(activity.validatedAt)}</span>
            {activity.tenet ? <span>{activity.tenet}</span> : null}
            {activity.branch ? <span>{activity.branch}</span> : null}
            {shortSha(activity.headSha) ? <span>{shortSha(activity.headSha)}</span> : null}
          </div>
        </div>
        <div className="timeline-score" aria-label="Health scores">
          <span>A {activity.architectureScore}</span>
          <span>I {activity.intentScore}</span>
        </div>
      </li>
    ))}
  </ol>
);

const OverviewPage = ({ data }: { data: DashboardViewData }) => {
  const series = useMemo(() => healthSeries(data), [data]);
  const activity = useMemo(() => activityForRuns(data), [data]);
  const latest = chronological(data.runs).at(-1);
  const resolved = data.violations.filter((violation) => violation.status === "resolved");
  const architectureScore = data.latestHealth?.architectureScore ?? latest?.architectureScore ?? 0;
  const intentScore = data.latestHealth?.intentScore ?? latest?.intentScore ?? 0;

  return (
    <>
      <PageHeader
        kicker="Repository overview"
        title={data.repository.displayName}
        description="Code changes are checked against architectural and business intent before they become production problems."
      >
        <span className={`status-badge ${statusClass(latest?.status ?? "WARN")}`}>
          Latest {latest?.status ?? "Unknown"}
        </span>
      </PageHeader>

      <section className="metrics-grid" aria-label="Current deterministic health">
        <MetricCard
          delta={scoreDelta(data, "architectureScore")}
          kind="architecture"
          label="Architecture Health"
          note="Derived by deterministic architecture validators."
          score={architectureScore}
        />
        <MetricCard
          delta={scoreDelta(data, "intentScore")}
          kind="intent"
          label="Intent Health"
          note="Derived by deterministic Tenet compliance."
          score={intentScore}
        />
        <article className="metric-card compact">
          <div className="metric-heading">
            <span className="metric-label">Active violations</span>
            <span className={`metric-status ${data.activeViolationCount === 0 ? "good" : "block"}`}>
              {data.activeViolationCount === 0 ? "Clear" : "Needs review"}
            </span>
          </div>
          <strong className="metric-count">{data.activeViolationCount}</strong>
          <div className="metric-footer">
            <p className="metric-footnote">
              {resolved.length} real lifecycle record{resolved.length === 1 ? "" : "s"} resolved in recent history.
            </p>
          </div>
        </article>
      </section>

      <section className="section-grid" aria-label="Repository history and lifecycle">
        <article className="panel">
          <div className="panel-header">
            <div className="panel-title-wrap">
              <h2 className="panel-title">Health history</h2>
              <p className="panel-subtitle">Engine-produced scores from persisted validation runs.</p>
            </div>
            <span className="data-label">{series.length} runs</span>
          </div>
          <div className="panel-body">
            <div className="section-grid equal" style={{ marginTop: 0 }}>
              <HealthChart metric="architecture" series={series} title="Architecture Health" />
              <HealthChart metric="intent" series={series} title="Intent Health" />
            </div>
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div className="panel-title-wrap">
              <h2 className="panel-title">Resolved violations</h2>
              <p className="panel-subtitle">Latest state is compliant; this history remains inspectable.</p>
            </div>
            <a className="button button-quiet" href="/violations">View all</a>
          </div>
          <div className="panel-body">
            {resolved.length === 0 ? (
              <p className="panel-subtitle">No resolved violation records have been persisted yet.</p>
            ) : (
              <div className="violation-list">
                {resolved.map((violation, index) => (
                  <a
                    className={`violation-summary motion-row ${violation.type}`}
                    href="/violations"
                    key={violation.id}
                    style={{ animationDelay: `${Math.min(index, 7) * 55}ms` }}
                  >
                    <span aria-hidden="true" className="violation-summary-line" />
                    <span className="violation-summary-copy">
                      <strong>{violation.title}</strong>
                      <span>{violation.tenetName ?? violation.type}</span>
                    </span>
                    <LifecycleBadge status={violation.status} />
                  </a>
                ))}
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="section-grid" aria-label="Recent validation activity">
        <article className="panel">
          <div className="panel-header">
            <div className="panel-title-wrap">
              <h2 className="panel-title">Recent validation activity</h2>
              <p className="panel-subtitle">Validation outcomes are synced after local deterministic enforcement.</p>
            </div>
            <a className="button button-quiet" href="/changes">Validation history</a>
          </div>
          <div className="panel-body">
            <ActivityTimeline activities={activity} />
          </div>
        </article>

        <article className="panel">
          <div className="panel-header">
            <div className="panel-title-wrap">
              <h2 className="panel-title">Latest validation</h2>
              <p className="panel-subtitle">Persisted control-plane telemetry, never a substitute for local enforcement.</p>
            </div>
          </div>
          <div className="panel-body">
            {latest ? (
              <div className="metadata-grid">
                <div className="metadata-item"><span className="data-label">Result</span><StatusBadge status={latest.status} /></div>
                <div className="metadata-item"><span className="data-label">Validated</span><strong>{formatDate(latest.validatedAt)}</strong></div>
                {latest.branch ? <div className="metadata-item"><span className="data-label">Branch</span><strong>{latest.branch}</strong></div> : null}
                {latest.headSha ? <div className="metadata-item"><span className="data-label">Commit</span><strong>{shortSha(latest.headSha)}</strong></div> : null}
                {latest.author ? <div className="metadata-item"><span className="data-label">Author</span><strong>{latest.author}</strong></div> : null}
                <div className="metadata-item"><span className="data-label">Source</span><strong>{humanize(latest.source)}</strong></div>
              </div>
            ) : (
              <p className="panel-subtitle">No validation run has been synchronized yet.</p>
            )}
          </div>
        </article>
      </section>
    </>
  );
};

const ArchitecturePage = ({ data }: { data: DashboardViewData }) => {
  const runs = useMemo(() => chronological(data.runs), [data.runs]);
  const driftRun = useMemo(
    () => runs.find((run) => run.status === "BLOCK" && run.architectureScore < 100),
    [runs],
  );
  const [selectedRunId, setSelectedRunId] = useState("");
  const selectedRun =
    runs.find((run) => run.id === selectedRunId) ?? driftRun ?? runs.at(-1);
  const selectedGraph = selectedRun?.graphSnapshot;
  const architectureViolation = data.violations.find(
    (violation) => violation.type === "architecture",
  );
  const architectureDetails = architectureViolation
    ? architectureDetailsFor(architectureViolation.details)
    : {};
  const expectedRoute = asStringArray(architectureDetails.expectedRoute);
  const actualDependency = isRecord(architectureDetails.actualDependency)
    ? architectureDetails.actualDependency
    : undefined;
  const selectedIsArchitectureDrift =
    selectedRun?.status === "BLOCK" && selectedRun.architectureScore < 100;
  const flaggedDependencyKeys = new Set<string>();
  if (selectedIsArchitectureDrift && actualDependency) {
    const source = asString(actualDependency.sourceModule);
    const target = asString(actualDependency.targetModule);
    if (source && target) {
      flaggedDependencyKeys.add(graphEdgeKey(source, target));
    }
  }
  const intendedEdges = selectedGraph ? graphEdges(selectedGraph, true) : [];
  const actualEdges = selectedGraph
    ? graphEdges(selectedGraph, false, flaggedDependencyKeys)
    : [];
  const unauthorizedEdges = actualEdges.filter((edge) => edge.unauthorized);

  return (
    <>
      <PageHeader
        kicker="Architecture control"
        title="Declared boundaries, inspected dependencies"
        description="Tenet compares the intended module graph with the runtime dependency graph produced by deterministic TypeScript analysis."
      >
        <label className="sr-only" htmlFor="architecture-run">Validation run</label>
        <select
          aria-label="Select validation run to inspect"
          id="architecture-run"
          onChange={(event) => setSelectedRunId(event.target.value)}
          value={selectedRun?.id ?? ""}
        >
          {runs.map((run, index) => (
            <option key={run.id} value={run.id}>
              Run {index + 1} — {run.status} — {formatDate(run.validatedAt)}
            </option>
          ))}
        </select>
      </PageHeader>

      {!selectedGraph || !selectedRun ? (
        <section className="empty-state">
          <div className="empty-state-content">
            <div aria-hidden="true" className="state-symbol">⌘</div>
            <p className="eyebrow">Architecture snapshot</p>
            <h1>No persisted graph snapshot is available</h1>
            <p>Run Tenet locally and synchronize the deterministic result to inspect a repository graph.</p>
          </div>
        </section>
      ) : (
        <>
          <section className="metrics-grid" aria-label="Architecture snapshot status">
            <MetricCard
              delta={0}
              kind="architecture"
              label="Architecture Health"
              note={`Score from ${formatDate(selectedRun.validatedAt)}.`}
              score={selectedRun.architectureScore}
            />
            <article className="metric-card compact">
              <div className="metric-heading"><span className="metric-label">Runtime dependencies</span><StatusBadge status={selectedRun.status} /></div>
              <strong className="metric-count">{actualEdges.length}</strong>
              <div className="metric-footer"><p className="metric-footnote">Direct runtime module dependencies in this persisted graph snapshot.</p></div>
            </article>
            <article className="metric-card compact">
              <div className="metric-heading"><span className="metric-label">Unauthorized edges</span><span className={`metric-status ${unauthorizedEdges.length === 0 ? "good" : "block"}`}>{unauthorizedEdges.length === 0 ? "Aligned" : "Drift"}</span></div>
              <strong className="metric-count">{unauthorizedEdges.length}</strong>
              <div className="metric-footer"><p className="metric-footnote">Compared directly to the allowed architecture edges persisted with this run.</p></div>
            </article>
          </section>

          <section className="architecture-grid" aria-label="Intended and actual architecture">
            <article className="graph-panel">
              <header>
                <div>
                  <p className="eyebrow">Declared architecture</p>
                  <h3>Intended dependency route</h3>
                  <p>The configured architecture used by the deterministic validator.</p>
                </div>
              </header>
              <ArchitectureGraph
                edges={intendedEdges}
                key={`intended-${selectedRun.id}`}
                nodes={graphNodes(selectedGraph, true, intendedEdges)}
                title="Intended architecture"
              />
            </article>
            <article className="graph-panel">
              <header>
                <div>
                  <p className="eyebrow">Analyzed repository</p>
                  <h3>Actual runtime dependencies</h3>
                  <p>Direct module edges from the selected synchronized validation run.</p>
                </div>
                <StatusBadge status={selectedRun.status} />
              </header>
              <ArchitectureGraph
                edges={actualEdges}
                emphasizedUnauthorized
                key={`actual-${selectedRun.id}`}
                nodes={graphNodes(selectedGraph, false, actualEdges)}
                title="Actual architecture"
              />
            </article>
          </section>

          {unauthorizedEdges.length > 0 ? (
            <section className="comparison-strip" aria-label="Architecture divergence">
              <div className="comparison-value">
                <span className="data-label">Expected route</span>
                <code>{expectedRoute.length > 0 ? expectedRoute.join(" -> ") : "Declared architecture path"}</code>
              </div>
              <span aria-hidden="true" className="comparison-arrow">!</span>
              <div className="comparison-value actual">
                <span className="data-label">Unauthorized direct dependency</span>
                <code>
                  {actualDependency
                    ? `${asString(actualDependency.sourceModule)} -> ${asString(actualDependency.targetModule)}`
                    : unauthorizedEdges.map((edge) => `${edge.sourceModule} -> ${edge.targetModule}`).join(", ")}
                </code>
              </div>
            </section>
          ) : (
            <section className="comparison-strip" aria-label="Architecture alignment">
              <div className="comparison-value"><span className="data-label">Architecture state</span><code>All analyzed direct edges are allowed.</code></div>
              <span aria-hidden="true" className="comparison-arrow">✓</span>
              <div className="comparison-value"><span className="data-label">Validation</span><code>No architectural drift was observed in this run.</code></div>
            </section>
          )}

          <section className="section-grid" aria-label="Architecture evidence">
            <article className="panel">
              <div className="panel-header">
                <div className="panel-title-wrap">
                  <h2 className="panel-title">Architecture policy evidence</h2>
                  <p className="panel-subtitle">The configured boundary is evaluated directly, not inferred by an AI system.</p>
                </div>
              </div>
              <div className="panel-body">
                {architectureViolation ? (
                  <div className="detail-sections">
                    <div className="detail-section"><h3>{unauthorizedEdges.length > 0 ? "Violated Tenet" : "Historical Tenet evidence"}</h3><p>{architectureViolation.tenetName ?? architectureViolation.title}</p></div>
                    <div className="detail-section"><h3>{unauthorizedEdges.length > 0 ? "Deterministic evidence" : "Resolved drift evidence"}</h3><EvidenceList evidence={architectureViolation.evidence} /></div>
                  </div>
                ) : (
                  <p className="panel-subtitle">No architecture violation lifecycle record exists for this repository.</p>
                )}
              </div>
            </article>
            <article className="panel">
              <div className="panel-header">
                <div className="panel-title-wrap"><h2 className="panel-title">Selected validation</h2><p className="panel-subtitle">Only persisted local analysis is displayed here.</p></div>
              </div>
              <div className="panel-body">
                <div className="metadata-grid">
                  <div className="metadata-item"><span className="data-label">Status</span><StatusBadge status={selectedRun.status} /></div>
                  <div className="metadata-item"><span className="data-label">Validated</span><strong>{formatDate(selectedRun.validatedAt)}</strong></div>
                  {selectedRun.branch ? <div className="metadata-item"><span className="data-label">Branch</span><strong>{selectedRun.branch}</strong></div> : null}
                  {selectedRun.headSha ? <div className="metadata-item"><span className="data-label">Commit</span><strong>{shortSha(selectedRun.headSha)}</strong></div> : null}
                  <div className="metadata-item"><span className="data-label">Warnings</span><strong>{selectedRun.warningCount}</strong></div>
                  <div className="metadata-item"><span className="data-label">Graph nodes</span><strong>{graphNodes(selectedGraph).length}</strong></div>
                </div>
              </div>
            </article>
          </section>
        </>
      )}
    </>
  );
};

const EvidenceList = ({ evidence }: { evidence: readonly ReadEvidence[] }) => {
  if (evidence.length === 0) {
    return <p className="panel-subtitle">No deterministic evidence excerpt was persisted.</p>;
  }
  return (
    <ul className="evidence-list">
      {evidence.map((item, index) => (
        <li className="evidence-item" key={`${item.file ?? "evidence"}-${index}`}>
          {item.excerpt ? <code>{item.excerpt}</code> : null}
          {item.file ? <span className="evidence-location">{item.file}{item.line ? `:${item.line}` : ""}{item.column ? `:${item.column}` : ""}</span> : null}
        </li>
      ))}
    </ul>
  );
};

const TenetsPage = ({
  data,
  onRefresh,
}: {
  data: DashboardViewData;
  onRefresh: () => void;
}) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const violationsByTenet = useMemo(() => {
    const count = new Map<string, number>();
    for (const violation of data.violations) {
      if (violation.tenetExternalId) {
        count.set(
          violation.tenetExternalId,
          (count.get(violation.tenetExternalId) ?? 0) + 1,
        );
      }
    }
    return count;
  }, [data.violations]);

  return (
    <>
      <PageHeader
        kicker="Tenet management"
        title="Human intent, compiled into policy"
        description="Active Tenets are structured deterministic constraints. GPT-5.6 may propose an interpretation, but a human must explicitly confirm it before it is stored as active."
      >
        <button className="button button-primary" onClick={() => setIsDialogOpen(true)} type="button">
          <span aria-hidden="true">+</span>
          New Tenet
        </button>
      </PageHeader>

      <section className="tenet-grid" aria-label="Persisted Tenets">
        {data.tenets.map((tenet) => {
          const linkedViolations = violationsByTenet.get(tenet.externalId) ?? 0;
          return (
            <article className="tenet-card" key={tenet.id}>
              <div className="tenet-topline">
                <span className={`type-badge ${tenet.type}`}>{tenet.type}</span>
                <span className={`lifecycle-badge ${tenet.status === "active" ? "resolved" : "active"}`}>{tenet.status}</span>
              </div>
              <div>
                <h2>{tenet.name}</h2>
                <p>{tenet.description}</p>
              </div>
              <div>
                <p className="data-label">Structured deterministic constraint</p>
                <pre className="constraint-block">{jsonForDisplay(tenet.constraint)}</pre>
              </div>
              <div className="tenet-footer">
                <span>{humanize(tenet.enforcement)} · {humanize(tenet.severity)}</span>
                <strong>{linkedViolations === 0 ? "No lifecycle findings" : `${linkedViolations} lifecycle finding${linkedViolations === 1 ? "" : "s"}`}</strong>
              </div>
            </article>
          );
        })}
      </section>

      {data.tenets.length === 0 ? (
        <section className="empty-state">
          <div className="empty-state-content"><div aria-hidden="true" className="state-symbol">+</div><p className="eyebrow">No active policy</p><h1>No Tenets have been persisted</h1><p>Create a proposal from human intent, then explicitly confirm it before enforcement configuration is distributed.</p></div>
        </section>
      ) : null}

      <section className="section-grid" aria-label="Tenet safety boundary">
        <article className="panel">
          <div className="panel-header"><div className="panel-title-wrap"><h2 className="panel-title">The enforcement boundary</h2><p className="panel-subtitle">Tenet keeps interpretation and enforcement separate by design.</p></div></div>
          <div className="panel-body"><div className="detail-sections"><div className="detail-section"><h3>GPT-5.6 can propose</h3><p>Natural-language intent can become a structured draft for a human to inspect.</p></div><div className="detail-section"><h3>Deterministic validators enforce</h3><p>Only supported static constraints determine PASS, WARN, BLOCK, health, and evidence.</p></div><div className="detail-section"><h3>Humans activate</h3><p>Confirmation persists an active control-plane Tenet. Local repositories remain local-first until explicitly synchronized.</p></div></div></div>
        </article>
        <article className="panel">
          <div className="panel-header"><div className="panel-title-wrap"><h2 className="panel-title">Policy coverage</h2><p className="panel-subtitle">Current deterministic validation history.</p></div></div>
          <div className="panel-body"><div className="analytics-stats"><div className="analytics-stat"><span className="data-label">Active Tenets</span><strong>{data.tenets.filter((tenet) => tenet.status === "active").length}</strong><span>Persisted and available to the control plane.</span></div><div className="analytics-stat"><span className="data-label">Enforced categories</span><strong>{new Set(data.tenets.map((tenet) => tenet.type)).size}</strong><span>Architecture and business constraints in this demo.</span></div></div></div>
        </article>
      </section>

      {isDialogOpen ? (
        <TenetProposalDialog
          aiConfigured={data.aiConfigured}
          onClose={() => setIsDialogOpen(false)}
          onConfirmed={() => {
            onRefresh();
            setIsDialogOpen(false);
          }}
        />
      ) : null}
    </>
  );
};

const modalFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** Keeps the product dialogs keyboard-contained and returns focus to the opener. */
const useModalAccessibility = (onClose: () => void) => {
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const focusable = () =>
      dialog
        ? Array.from(dialog.querySelectorAll<HTMLElement>(modalFocusableSelector)).filter(
            (element) => element.offsetParent !== null,
          )
        : [];
    const first = focusable()[0];
    first?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const candidates = focusable();
      const firstCandidate = candidates[0];
      const lastCandidate = candidates.at(-1);
      if (!firstCandidate || !lastCandidate) {
        return;
      }
      if (event.shiftKey && document.activeElement === firstCandidate) {
        event.preventDefault();
        lastCandidate.focus();
      } else if (!event.shiftKey && document.activeElement === lastCandidate) {
        event.preventDefault();
        firstCandidate.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      returnFocusRef.current?.focus();
    };
  }, [onClose]);

  return dialogRef;
};

const TenetProposalDialog = ({
  aiConfigured,
  onClose,
  onConfirmed,
}: {
  aiConfigured: boolean;
  onClose: () => void;
  onConfirmed: () => void;
}) => {
  const dialogRef = useModalAccessibility(onClose);
  const [intent, setIntent] = useState(
    "Checkout should never access the database directly. It must go through DatabaseGateway.",
  );
  const [proposal, setProposal] = useState<IntentProposal>();
  const [error, setError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmationNotice, setConfirmationNotice] = useState<string>();

  const requestProposal = async () => {
    setIsSubmitting(true);
    setError(undefined);
    setConfirmationNotice(undefined);
    try {
      const response = await postJson(`/api/repositories/${repositorySlug}/tenet-proposals`, {
        intent,
      });
      if (!isRecord(response) || !isRecord(response.proposal)) {
        throw new Error("The AI proposal response was malformed and was not accepted.");
      }
      const parsedProposal = IntentProposalSchema.safeParse(response.proposal);
      if (!parsedProposal.success) {
        throw new Error("The AI proposal response was malformed and was not accepted.");
      }
      const candidate = parsedProposal.data;
      if (candidate.requiresHumanConfirmation !== true || candidate.proposedTenet.status !== "draft") {
        throw new Error("The AI proposal did not preserve the required human confirmation boundary.");
      }
      setProposal(candidate);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to create a Tenet proposal.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmProposal = async () => {
    if (!proposal) {
      return;
    }
    setIsConfirming(true);
    setError(undefined);
    try {
      const response = await postJson(`/api/repositories/${repositorySlug}/tenets/confirm`, {
        proposal,
        confirmed: true,
      });
      if (!isRecord(response) || response.localRepositorySyncRequired !== true) {
        throw new Error("The confirmation response did not preserve local-first enforcement.");
      }
      setConfirmationNotice(
        "The Tenet is active in the control plane. Publish or synchronize repository configuration before local CLI checks enforce this new policy.",
      );
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to confirm this Tenet.");
    } finally {
      setIsConfirming(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-modal="true" aria-labelledby="new-tenet-title" className="modal wide" ref={dialogRef} role="dialog">
        <header className="modal-header">
          <div><p className="eyebrow">GPT-5.6 proposal workflow</p><h2 id="new-tenet-title">New Tenet</h2></div>
          <button aria-label="Close New Tenet dialog" className="modal-close" onClick={onClose} type="button">×</button>
        </header>
        <div className="modal-body">
          {!proposal ? (
            <div className="form-stack">
              <div className="form-field">
                <label htmlFor="tenet-intent">Describe what must remain true</label>
                <textarea id="tenet-intent" onChange={(event) => setIntent(event.target.value)} value={intent} />
                <p className="form-help">GPT-5.6 can only propose a supported structured draft. It cannot validate the repository or activate a policy.</p>
              </div>
              {!aiConfigured ? <p className="form-error">GPT-5.6 is not configured in this environment. Add OPENAI_API_KEY to enable real proposals; no proposal is simulated.</p> : null}
              {error ? <p className="form-error">{error}</p> : null}
              <div className="proposal-safety"><span aria-hidden="true">i</span><span><strong>Human confirmation required.</strong> A proposal remains a draft until you explicitly confirm it. Confirmation does not silently modify local CLI enforcement.</span></div>
            </div>
          ) : (
            <div className="proposal-summary">
              <div className="proposal-safety"><span aria-hidden="true">i</span><span><strong>Proposed, not enforceable yet.</strong> Review this GPT-5.6 interpretation against the original intent before confirming.</span></div>
              <div className="proposal-row"><span className="data-label">Original intent</span><p>{proposal.sourceIntent}</p></div>
              <div className="proposal-row"><span className="data-label">Proposed Tenet</span><p><strong>{proposal.proposedTenet.name}</strong> · {humanize(proposal.proposedTenet.type)} · {humanize(proposal.proposedTenet.enforcement)}</p></div>
              <div className="proposal-row"><span className="data-label">Natural-language policy</span><p>{proposal.proposedTenet.description}</p></div>
              <div className="proposal-row"><span className="data-label">Structured enforcement</span><pre className="constraint-block">{JSON.stringify(proposal.proposedTenet.constraint, null, 2)}</pre></div>
              <div className="proposal-row"><span className="data-label">Rationale</span><p>{proposal.rationale}</p></div>
              <div className="proposal-row"><span className="data-label">Assumptions</span><ul className="proposal-assumptions">{proposal.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul></div>
              {confirmationNotice ? <p className="proposal-safety">{confirmationNotice}</p> : null}
              {error ? <p className="form-error">{error}</p> : null}
            </div>
          )}
        </div>
        <footer className="modal-footer">
          {confirmationNotice ? <button className="button button-primary" onClick={onConfirmed} type="button">Done</button> : proposal ? <><button className="button button-quiet" onClick={onClose} type="button">Cancel</button><button className="button button-secondary" onClick={() => setProposal(undefined)} type="button">Back to intent</button><button className="button button-primary" disabled={isConfirming} onClick={() => void confirmProposal()} type="button">{isConfirming ? "Confirming…" : "Confirm & Enforce"}</button></> : <><button className="button button-quiet" onClick={onClose} type="button">Cancel</button><button className="button button-primary" disabled={isSubmitting || !aiConfigured || intent.trim().length === 0} onClick={() => void requestProposal()} type="button">{isSubmitting ? "Interpreting…" : "Propose Tenet"}</button></>}
        </footer>
      </section>
    </div>
  );
};

const ViolationsPage = ({ data }: { data: DashboardViewData }) => {
  const [filter, setFilter] = useState<ViolationFilter>("all");
  const [selected, setSelected] = useState<ReadViolation>();
  const visible = data.violations.filter((violation) =>
    filter === "all"
      ? true
      : filter === "resolved"
        ? violation.status === "resolved"
        : violation.status !== "resolved",
  );

  return (
    <>
      <PageHeader
        kicker="Violation explorer"
        title="Deterministic findings with lifecycle evidence"
        description="Violations retain the validator evidence that caused the decision. AI can explain that evidence, but it cannot change status, health, or enforcement."
      >
        <div className="filter-bar" role="group" aria-label="Filter violation lifecycle">
          {(["all", "active", "resolved"] as const).map((item) => (
            <button
              className={`filter-button ${filter === item ? "is-active" : ""}`}
              key={item}
              onClick={() => setFilter(item)}
              type="button"
            >
              {humanize(item)}
            </button>
          ))}
        </div>
      </PageHeader>

      <section className="metrics-grid" aria-label="Violation lifecycle summary">
        <article className="metric-card compact"><div className="metric-heading"><span className="metric-label">Active</span><span className={`metric-status ${data.activeViolationCount === 0 ? "good" : "block"}`}>{data.activeViolationCount === 0 ? "Clear" : "Open"}</span></div><strong className="metric-count">{data.activeViolationCount}</strong><div className="metric-footer"><p className="metric-footnote">Current state from persisted lifecycle records.</p></div></article>
        <article className="metric-card compact"><div className="metric-heading"><span className="metric-label">Resolved</span><span className="metric-status good">History retained</span></div><strong className="metric-count">{data.violations.filter((violation) => violation.status === "resolved").length}</strong><div className="metric-footer"><p className="metric-footnote">Resolved records remain available for investigation.</p></div></article>
        <article className="metric-card compact"><div className="metric-heading"><span className="metric-label">Policies affected</span><span className="metric-status good">Deterministic</span></div><strong className="metric-count">{new Set(data.violations.map((violation) => violation.tenetExternalId).filter(Boolean)).size}</strong><div className="metric-footer"><p className="metric-footnote">Unique persisted Tenets with recorded findings.</p></div></article>
      </section>

      <section className="table-panel" aria-label="Persisted violations">
        <div className="panel-header">
          <div className="panel-title-wrap"><h2 className="panel-title">{humanize(filter)} violations</h2><p className="panel-subtitle">Select a finding to inspect authoritative evidence, impact, and lifecycle.</p></div>
          <span className="data-label">{visible.length} records</span>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Violation</th><th>Tenet</th><th>Status</th><th>Impact</th><th>Last observed</th></tr></thead>
            <tbody>
              {visible.map((violation) => (
                <tr key={violation.id}>
                  <td><button className="primary-cell button button-quiet" onClick={() => setSelected(violation)} type="button"><strong>{violation.title}</strong><span>{humanize(violation.type)} · {humanize(violation.severity)}</span></button></td>
                  <td><span className="table-muted">{violation.tenetName ?? "Detached Tenet record"}</span></td>
                  <td><LifecycleBadge status={violation.status} /></td>
                  <td><HealthImpact value={violation.healthImpact} type={violation.type} /></td>
                  <td><span className="table-muted">{formatDate(violation.lastSeenAt)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {visible.length === 0 ? <div className="panel-body"><p className="panel-subtitle">No persisted violations match this lifecycle filter.</p></div> : null}
      </section>

      {selected ? <ViolationDetailDialog aiConfigured={data.aiConfigured} onClose={() => setSelected(undefined)} violation={selected} /> : null}
    </>
  );
};

const HealthImpact = ({ value, type }: { value: JsonRecord; type: string }) => {
  const architecture = healthDeductionTotal(value.architecture);
  const intent = healthDeductionTotal(value.intent);
  if (architecture === 0 && intent === 0) {
    return <span className="table-muted">No deduction recorded</span>;
  }
  return <span className="health-pair">{architecture > 0 ? <span>A -{architecture}</span> : null}{intent > 0 ? <span>I -{intent}</span> : null}{type === "semantic" && intent === 0 ? <span>Intent affected</span> : null}</span>;
};

const DiscountContributors = ({ details }: { details: JsonRecord }) => {
  const contributors = asArray(details.contributingDiscounts)
    .filter(isRecord)
    .map((discount) => ({
      id: asString(discount.id, "discount"),
      name: asString(discount.name, asString(discount.id, "Discount")),
      percent: asNumber(discount.percent),
      file: asString(discount.sourceFile),
      line: typeof discount.line === "number" ? discount.line : undefined,
    }));
  if (contributors.length === 0) {
    return <p className="panel-subtitle">No contributor details were persisted.</p>;
  }
  return <ul className="evidence-list">{contributors.map((discount) => <li className="evidence-item" key={discount.id}><code>{discount.name} — {discount.percent}%</code>{discount.file ? <span className="evidence-location">{discount.file}{discount.line ? `:${discount.line}` : ""}</span> : null}</li>)}</ul>;
};

const ViolationDetailDialog = ({
  aiConfigured,
  onClose,
  violation,
}: {
  aiConfigured: boolean;
  onClose: () => void;
  violation: ReadViolation;
}) => {
  const dialogRef = useModalAccessibility(onClose);
  const [explanation, setExplanation] = useState<DeveloperExplanation>();
  const [error, setError] = useState<string>();
  const [isExplaining, setIsExplaining] = useState(false);
  const details = violation.details;
  const isArchitecture = violation.type === "architecture";
  const isSemantic = violation.type === "semantic";
  const architectureDetails = architectureDetailsFor(details);
  const semanticDetails = semanticDetailsFor(details);
  const expectedRoute = asStringArray(architectureDetails.expectedRoute);
  const actualDependency = isRecord(architectureDetails.actualDependency)
    ? architectureDetails.actualDependency
    : undefined;
  const maximumPercent = asNumber(semanticDetails.maximumPercent);
  const potentialPercent = asNumber(semanticDetails.potentialPercent);

  const askForExplanation = async () => {
    setIsExplaining(true);
    setError(undefined);
    try {
      const response = await postJson(
        `/api/repositories/${repositorySlug}/violations/${encodeURIComponent(violation.fingerprint)}/explanation`,
      );
      if (!isRecord(response) || !isRecord(response.explanation)) {
        throw new Error("The AI explanation response was malformed and was not shown.");
      }
      const parsedExplanation = DeveloperExplanationSchema.safeParse(response.explanation);
      if (!parsedExplanation.success) {
        throw new Error("The AI explanation response was malformed and was not shown.");
      }
      const candidate = parsedExplanation.data;
      if (candidate.violationFingerprint !== violation.fingerprint) {
        throw new Error("The AI explanation did not acknowledge the selected deterministic finding.");
      }
      setExplanation(candidate);
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "Unable to request an evidence explanation.");
    } finally {
      setIsExplaining(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-modal="true" aria-labelledby="violation-detail-title" className="modal wide" ref={dialogRef} role="dialog">
        <header className="modal-header">
          <div><p className="eyebrow">{humanize(violation.type)} violation</p><h2 id="violation-detail-title">{violation.title}</h2></div>
          <button aria-label="Close violation details" className="modal-close" onClick={onClose} type="button">×</button>
        </header>
        <div className="modal-body">
          <div className="detail-sections">
            <div className="detail-section"><h3>What happened</h3><p>{violation.message}</p></div>
            <div className="detail-section"><h3>Which Tenet was violated</h3><p>{violation.tenetName ?? violation.tenetExternalId ?? "No linked Tenet name was persisted."}</p></div>
            {isArchitecture ? <div className="detail-section"><h3>Expected versus actual</h3><div className="comparison-strip"><div className="comparison-value"><span className="data-label">Expected</span><code>{expectedRoute.join(" -> ") || "Declared route"}</code></div><span aria-hidden="true" className="comparison-arrow">!</span><div className="comparison-value actual"><span className="data-label">Actual</span><code>{actualDependency ? `${asString(actualDependency.sourceModule)} -> ${asString(actualDependency.targetModule)}` : "Unauthorized direct dependency"}</code></div></div></div> : null}
            {isSemantic ? <div className="detail-section"><h3>Deterministic business calculation</h3><div className="metadata-grid"><div className="metadata-item"><span className="data-label">Maximum allowed</span><strong>{maximumPercent}%</strong></div><div className="metadata-item"><span className="data-label">Potential combined</span><strong>{potentialPercent}%</strong></div></div><DiscountContributors details={semanticDetails} /></div> : null}
            <div className="detail-section"><h3>Deterministic evidence</h3><EvidenceList evidence={violation.evidence} /></div>
            <div className="detail-section"><h3>Why it matters</h3><p>{isArchitecture ? "The direct dependency bypassed the declared persistence boundary, increasing coupling between checkout and the database layer." : isSemantic ? "The two independently valid declarations could be combined past the customer discount cap, so the resulting intent was blocked." : "This finding was produced by a deterministic active Tenet."}</p></div>
            <div className="detail-section"><h3>Lifecycle</h3><div className="metadata-grid"><div className="metadata-item"><span className="data-label">Status</span><LifecycleBadge status={violation.status} /></div><div className="metadata-item"><span className="data-label">Fingerprint</span><strong>{violation.fingerprint}</strong></div><div className="metadata-item"><span className="data-label">First seen</span><strong>{formatDate(violation.firstSeenAt)}</strong></div><div className="metadata-item"><span className="data-label">Last seen</span><strong>{formatDate(violation.lastSeenAt)}</strong></div>{violation.resolvedAt ? <div className="metadata-item"><span className="data-label">Resolved</span><strong>{formatDate(violation.resolvedAt)}</strong></div> : null}</div></div>
            {explanation ? <div className="detail-section"><h3>AI explanation — non-authoritative</h3><div className="explanation-card"><strong>{explanation.summary}</strong><p>{explanation.whyItMatters}</p><ul>{explanation.suggestedNextSteps.map((step) => <li key={step}>{step}</li>)}</ul></div></div> : null}
            {error ? <p className="form-error">{error}</p> : null}
          </div>
        </div>
        <footer className="modal-footer">
          <button className="button button-quiet" onClick={onClose} type="button">Close</button>
          <button className="button button-secondary" disabled={!aiConfigured || isExplaining} onClick={() => void askForExplanation()} title={aiConfigured ? "Explain deterministic evidence with GPT-5.6" : "OPENAI_API_KEY is required; no explanation is simulated."} type="button">{isExplaining ? "Explaining…" : explanation ? "Refresh explanation" : "Explain with GPT-5.6"}</button>
        </footer>
      </section>
    </div>
  );
};

const ChangesPage = ({ data }: { data: DashboardViewData }) => {
  const activities = useMemo(
    () => activityForRuns(data),
    [data],
  );
  const [selectedRunId, setSelectedRunId] = useState<string>();
  const selectedActivity = activities.find((item) => item.id === selectedRunId);

  return (
    <>
      <PageHeader
        kicker="Validation history"
        title="Changes through the lens of intent"
        description="Each record is a real local deterministic validation result that was synchronized to the control plane after enforcement completed."
      />
      <section className="table-panel" aria-label="Validation run history">
        <div className="panel-header">
          <div className="panel-title-wrap"><h2 className="panel-title">Persisted validation runs</h2><p className="panel-subtitle">No commit, author, or branch details are invented when the local run did not provide them.</p></div>
          <span className="data-label">{activities.length} runs</span>
        </div>
        <div className="data-table-wrap">
          <table className="data-table">
            <thead><tr><th>Outcome</th><th>Validation</th><th>Branch / commit</th><th>Health</th><th>Warnings</th></tr></thead>
            <tbody>
              {activities.slice().reverse().map((activity) => {
                const run = data.runs.find((item) => item.id === activity.id);
                if (!run) {
                  return null;
                }
                return (
                  <tr key={activity.id}>
                    <td><StatusBadge status={run.status} /></td>
                    <td><button className="primary-cell button button-quiet" onClick={() => setSelectedRunId(run.id)} type="button"><strong>{activity.title}</strong><span>{activity.detail}</span></button></td>
                    <td><span className="table-muted">{run.branch ?? "Branch not recorded"}{run.headSha ? ` · ${shortSha(run.headSha)}` : ""}</span>{run.author ? <span className="table-muted">{run.author}</span> : null}</td>
                    <td><span className="health-pair"><span>A {run.architectureScore}</span><span>I {run.intentScore}</span></span></td>
                    <td><span className="table-muted">{run.warningCount}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {selectedActivity ? (
        <section className="section-grid" aria-label="Selected validation details">
          <article className="panel">
            <div className="panel-header"><div className="panel-title-wrap"><h2 className="panel-title">{selectedActivity.title}</h2><p className="panel-subtitle">{selectedActivity.detail}</p></div><StatusBadge status={selectedActivity.status} /></div>
            <div className="panel-body"><div className="metadata-grid"><div className="metadata-item"><span className="data-label">Validated</span><strong>{formatDate(selectedActivity.validatedAt)}</strong></div><div className="metadata-item"><span className="data-label">Architecture Health</span><strong>{selectedActivity.architectureScore}/100</strong></div><div className="metadata-item"><span className="data-label">Intent Health</span><strong>{selectedActivity.intentScore}/100</strong></div>{selectedActivity.branch ? <div className="metadata-item"><span className="data-label">Branch</span><strong>{selectedActivity.branch}</strong></div> : null}{selectedActivity.headSha ? <div className="metadata-item"><span className="data-label">Commit</span><strong>{shortSha(selectedActivity.headSha)}</strong></div> : null}</div></div>
          </article>
          <article className="panel">
            <div className="panel-header"><div className="panel-title-wrap"><h2 className="panel-title">Intent effect</h2><p className="panel-subtitle">Derived from the persisted scores and violation lifecycle.</p></div></div>
            <div className="panel-body"><div className="detail-sections"><div className="detail-section"><h3>Validation result</h3><p>{selectedActivity.status === "BLOCK" ? "A deterministic Tenet blocked this change locally before synchronization." : "The local deterministic validation completed without a blocking finding."}</p></div><div className="detail-section"><h3>Recorded effect</h3><p>Architecture {selectedActivity.architectureScore}/100 · Intent {selectedActivity.intentScore}/100.</p></div><div className="detail-section"><h3>Git context</h3><p>{selectedActivity.branch || selectedActivity.headSha ? `${selectedActivity.branch ?? "Branch not recorded"}${selectedActivity.headSha ? ` at ${shortSha(selectedActivity.headSha)}` : ""}.` : "No Git metadata was captured for this validation run."}</p></div></div></div>
          </article>
        </section>
      ) : null}

      {activities.length === 0 ? <section className="empty-state"><div className="empty-state-content"><div aria-hidden="true" className="state-symbol">↗</div><p className="eyebrow">No history</p><h1>No validation runs have been synchronized</h1><p>Use tenet check with control-plane synchronization to populate this repository history.</p></div></section> : null}
    </>
  );
};

const AnalyticsPage = ({ data }: { data: DashboardViewData }) => {
  const series = useMemo(() => healthSeries(data), [data]);
  const outcomes = useMemo(() => {
    const count = new Map<ValidationRun["status"], number>();
    for (const run of data.runs) {
      count.set(run.status, (count.get(run.status) ?? 0) + 1);
    }
    return count;
  }, [data.runs]);
  const violationsByType = useMemo(() => {
    const count = new Map<string, number>();
    for (const violation of data.violations) {
      count.set(violation.type, (count.get(violation.type) ?? 0) + 1);
    }
    return [...count.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [data.violations]);
  const totalViolations = Math.max(1, data.violations.length);
  const totalRuns = Math.max(1, data.runs.length);
  const activeTenets = data.tenets.filter((tenet) => tenet.status === "active").length;

  return (
    <>
      <PageHeader
        kicker="Repository analytics"
        title="Evidence-backed engineering health"
        description="Analytics are limited to real persisted validation data: health, outcomes, Tenet lifecycle, and violation categories."
      />
      <section className="analytics-grid" aria-label="Health analytics">
        <article className="panel">
          <div className="panel-header"><div className="panel-title-wrap"><h2 className="panel-title">Health over persisted runs</h2><p className="panel-subtitle">Temporary drift and intent drops remain visible after fixes.</p></div><span className="data-label">{series.length} snapshots</span></div>
          <div className="panel-body"><div className="section-grid equal" style={{ marginTop: 0 }}><HealthChart metric="architecture" series={series} title="Architecture Health" /><HealthChart metric="intent" series={series} title="Intent Health" /></div></div>
        </article>
        <article className="panel">
          <div className="panel-header"><div className="panel-title-wrap"><h2 className="panel-title">Current state</h2><p className="panel-subtitle">Latest persisted deterministic result.</p></div></div>
          <div className="panel-body"><div className="analytics-stats"><div className="analytics-stat"><span className="data-label">Architecture</span><strong>{data.latestHealth?.architectureScore ?? "—"}</strong><span>Latest Architecture Health score.</span></div><div className="analytics-stat"><span className="data-label">Intent</span><strong>{data.latestHealth?.intentScore ?? "—"}</strong><span>Latest Intent Health score.</span></div><div className="analytics-stat"><span className="data-label">Active findings</span><strong>{data.activeViolationCount}</strong><span>Current lifecycle state.</span></div><div className="analytics-stat"><span className="data-label">Active Tenets</span><strong>{activeTenets}</strong><span>Persisted policy records.</span></div></div></div>
        </article>
      </section>

      <section className="section-grid" aria-label="Outcome and violation analytics">
        <article className="panel">
          <div className="panel-header"><div className="panel-title-wrap"><h2 className="panel-title">Validation outcomes</h2><p className="panel-subtitle">Real local validator results synchronized to this repository.</p></div></div>
          <div className="panel-body"><div className="bar-list">{(["PASS", "WARN", "BLOCK"] as const).map((status) => { const count = outcomes.get(status) ?? 0; return <div className="bar-list-item" key={status}><span><StatusBadge status={status} /></span><div className="bar-track"><div className={`bar-fill ${statusClass(status)}`} style={{ width: `${(count / totalRuns) * 100}%` }} /></div><strong>{count}</strong></div>; })}</div></div>
        </article>
        <article className="panel">
          <div className="panel-header"><div className="panel-title-wrap"><h2 className="panel-title">Violation categories</h2><p className="panel-subtitle">One logical record per deterministic fingerprint.</p></div></div>
          <div className="panel-body"><div className="bar-list">{violationsByType.map(([type, count]) => <div className="bar-list-item" key={type}><span>{humanize(type)}</span><div className="bar-track"><div className={`bar-fill ${type === "semantic" ? "semantic" : ""}`} style={{ width: `${(count / totalViolations) * 100}%` }} /></div><strong>{count}</strong></div>)}</div></div>
        </article>
      </section>

      <section className="section-grid" aria-label="Lifecycle analytics">
        <article className="panel"><div className="panel-header"><div className="panel-title-wrap"><h2 className="panel-title">Lifecycle balance</h2><p className="panel-subtitle">Resolved violations are kept as real evidence of enforcement.</p></div></div><div className="panel-body"><div className="bar-list"><div className="bar-list-item"><span>Resolved</span><div className="bar-track"><div className="bar-fill resolved" style={{ width: `${(data.violations.filter((item) => item.status === "resolved").length / totalViolations) * 100}%` }} /></div><strong>{data.violations.filter((item) => item.status === "resolved").length}</strong></div><div className="bar-list-item"><span>Active / blocked</span><div className="bar-track"><div className="bar-fill active" style={{ width: `${(data.violations.filter((item) => item.status !== "resolved").length / totalViolations) * 100}%` }} /></div><strong>{data.violations.filter((item) => item.status !== "resolved").length}</strong></div></div></div></article>
        <article className="panel"><div className="panel-header"><div className="panel-title-wrap"><h2 className="panel-title">Tenet compliance</h2><p className="panel-subtitle">Current active policy state, without invented organizational metrics.</p></div></div><div className="panel-body"><div className="detail-sections"><div className="detail-section"><h3>Active enforcement</h3><p>{activeTenets} active Tenet{activeTenets === 1 ? "" : "s"} are stored for this repository.</p></div><div className="detail-section"><h3>Current findings</h3><p>{data.activeViolationCount === 0 ? "No active deterministic violations are recorded in the latest lifecycle state." : `${data.activeViolationCount} active deterministic violation${data.activeViolationCount === 1 ? "" : "s"} require attention.`}</p></div></div></div></article>
      </section>
    </>
  );
};
