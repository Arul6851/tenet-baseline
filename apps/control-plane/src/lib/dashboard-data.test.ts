import { describe, expect, it } from "vitest";

import {
  activityForRuns,
  currentHealthFor,
  filterViolations,
  healthSeriesFor,
  parseDashboardData,
  type DashboardApiPayloads,
} from "./dashboard-data.js";

const repository = {
  id: "9d42be9b-c9e0-4c6a-9f39-4fe5c049310a",
  slug: "commerce-platform",
  name: "commerce-platform",
  displayName: "acme/commerce-platform",
  defaultBranch: "main",
  createdAt: "2026-07-21T09:00:00.000Z",
  updatedAt: "2026-07-21T09:00:00.000Z",
};

const timestamps = [
  "2026-07-21T09:00:00.000Z",
  "2026-07-21T09:01:00.000Z",
  "2026-07-21T09:02:00.000Z",
  "2026-07-21T09:03:00.000Z",
  "2026-07-21T09:04:00.000Z",
] as const;

const intendedArchitecture = {
  modules: [
    { id: "checkout", label: "Checkout", paths: ["src/checkout/**"] },
    { id: "gateway", label: "DatabaseGateway", paths: ["src/gateway/**"] },
    { id: "database", label: "Database", paths: ["src/database/**"] },
  ],
  intendedEdges: [
    ["checkout", "gateway"],
    ["gateway", "database"],
  ],
  allowedEdges: [
    { sourceModule: "checkout", targetModule: "gateway" },
    { sourceModule: "gateway", targetModule: "database" },
  ],
};

const runtimeEdge = (
  sourceModule: string,
  targetModule: string,
  sourceFile: string,
): Record<string, unknown> => ({
  sourceModule,
  targetModule,
  sourceFile,
  targetFile: `src/${targetModule}/index.ts`,
  importSpecifier: `../${targetModule}`,
  importKind: "runtime",
  line: 1,
  column: 20,
});

const graphFor = (includeDrift: boolean): Record<string, unknown> => ({
  nodes: intendedArchitecture.modules,
  edges: [
    runtimeEdge("checkout", "gateway", "src/checkout/checkout-service.ts"),
    runtimeEdge("gateway", "database", "src/gateway/database-gateway.ts"),
    ...(includeDrift
      ? [runtimeEdge("checkout", "database", "src/checkout/checkout-service.ts")]
      : []),
    {
      ...runtimeEdge("checkout", "database", "src/checkout/checkout-types.ts"),
      importKind: "type",
    },
  ],
  intendedArchitecture,
});

const makeRun = (
  index: number,
  status: "PASS" | "BLOCK",
  architectureScore: number,
  intentScore: number,
  includeDrift = false,
): Record<string, unknown> => ({
  id: `run-${index}`,
  ingestionKey: `ingestion-${index}`,
  source: "cli",
  status,
  baseSha: null,
  headSha: null,
  branch: null,
  author: null,
  commitMessage: null,
  warningCount: 0,
  architectureScore,
  intentScore,
  graphSnapshot: graphFor(includeDrift),
  validatedAt: timestamps[index - 1],
  createdAt: timestamps[index - 1],
});

const makeSnapshot = (
  index: number,
  architectureScore: number,
  intentScore: number,
): Record<string, unknown> => ({
  validationRunId: `run-${index}`,
  architectureScore,
  intentScore,
  architectureBreakdown: [],
  intentBreakdown: [],
  validatedAt: timestamps[index - 1],
  createdAt: timestamps[index - 1],
});

const makeViolation = (
  id: string,
  type: "architecture" | "semantic",
  status: "active" | "resolved" | "blocked",
  firstSeenAt: string,
  resolvedAt: string | null,
): Record<string, unknown> => ({
  id,
  fingerprint: `${type}:${id}`,
  type,
  severity: type === "architecture" ? "high" : "critical",
  enforcement: "block_merge",
  status,
  title: type === "architecture" ? "Architectural drift detected" : "Semantic conflict detected",
  message: `${type} evidence from the deterministic validator.`,
  affectedFiles:
    type === "architecture"
      ? ["src/checkout/checkout-service.ts"]
      : ["src/pricing/discount-policy.ts", "src/loyalty/premium-loyalty-discount.ts"],
  evidence: [
    {
      kind: type === "architecture" ? "import" : "discount",
      file:
        type === "architecture"
          ? "src/checkout/checkout-service.ts"
          : "src/pricing/discount-policy.ts",
      line: 1,
      column: 1,
      excerpt: "deterministic source evidence",
    },
  ],
  details: {},
  healthImpact: {},
  firstSeenAt,
  lastSeenAt: firstSeenAt,
  resolvedAt,
  tenetName:
    type === "architecture"
      ? "Checkout Persistence Boundary"
      : "Maximum Combined Discount",
  tenetExternalId:
    type === "architecture" ? "checkout-persistence-boundary" : "maximum-combined-discount",
});

const tenets = [
  {
    id: "tenet-architecture",
    externalId: "checkout-persistence-boundary",
    name: "Checkout Persistence Boundary",
    description: "Checkout must use DatabaseGateway.",
    type: "architecture",
    severity: "high",
    enforcement: "block_merge",
    status: "active",
    scope: ["checkout", "gateway", "database"],
    constraint: {
      kind: "forbid_direct_dependency",
      sourceModule: "checkout",
      targetModule: "database",
    },
    updatedAt: timestamps[4],
  },
  {
    id: "tenet-business",
    externalId: "maximum-combined-discount",
    name: "Maximum Combined Discount",
    description: "Customer discounts must remain below 30%.",
    type: "business",
    severity: "critical",
    enforcement: "block_merge",
    status: "active",
    scope: ["pricing", "loyalty"],
    constraint: { kind: "max_combined_discount", maximumPercent: 30 },
    updatedAt: timestamps[4],
  },
];

const createPayloads = (): DashboardApiPayloads => {
  const runs = [
    makeRun(1, "PASS", 100, 100),
    makeRun(2, "BLOCK", 95, 100, true),
    makeRun(3, "PASS", 100, 100),
    makeRun(4, "BLOCK", 100, 0),
    makeRun(5, "PASS", 100, 100),
  ];
  const snapshots = [
    makeSnapshot(1, 100, 100),
    makeSnapshot(2, 95, 100),
    makeSnapshot(3, 100, 100),
    makeSnapshot(4, 100, 0),
    makeSnapshot(5, 100, 100),
  ];

  return {
    summary: {
      repository,
      latestHealth: {
        validationRunId: "run-5",
        architectureScore: 100,
        intentScore: 100,
        validatedAt: timestamps[4],
      },
      activeViolationCount: 0,
    },
    // The real read API returns newest first; the view-model boundary reorders it.
    validationRuns: { repository, runs: [...runs].reverse() },
    violations: {
      repository,
      violations: [
        makeViolation("architecture", "architecture", "resolved", timestamps[1], timestamps[2]),
        makeViolation("semantic", "semantic", "resolved", timestamps[3], timestamps[4]),
      ],
    },
    health: { repository, snapshots: [...snapshots].reverse() },
    tenets: { repository, tenets },
  };
};

const parsedData = () => {
  const parsed = parseDashboardData(createPayloads());
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }

  return parsed.data;
};

describe("dashboard data view models", () => {
  it("orders persisted history chronologically and derives real health deltas", () => {
    const data = parsedData();

    expect(data.runs.map((run) => run.id)).toEqual([
      "run-1",
      "run-2",
      "run-3",
      "run-4",
      "run-5",
    ]);
    expect(healthSeriesFor(data, "architecture").map((point) => point.score)).toEqual([
      100,
      95,
      100,
      100,
      100,
    ]);
    expect(healthSeriesFor(data, "intent").map((point) => point.score)).toEqual([
      100,
      100,
      100,
      0,
      100,
    ]);
    expect(currentHealthFor(data, "architecture")).toMatchObject({
      score: 100,
      previousScore: 100,
      delta: 0,
      validationRunId: "run-5",
    });
    expect(currentHealthFor(data, "intent")).toMatchObject({
      score: 100,
      previousScore: 0,
      delta: 100,
      validationRunId: "run-5",
    });
  });

  it("derives the persisted five-run activity story without inventing Git metadata", () => {
    const data = parsedData();
    const activity = activityForRuns(data.runs, data.violations);

    expect(activity.map((item) => item.label)).toEqual([
      "Repository compliant",
      "Architectural drift detected",
      "Architecture restored",
      "Semantic conflict detected",
      "Intent restored",
    ]);
    expect(activity[1]).toMatchObject({
      architectureDelta: -5,
      intentDelta: 0,
      observedViolationTypes: ["architecture"],
    });
    expect(activity[3]).toMatchObject({
      architectureDelta: 0,
      intentDelta: -100,
      observedViolationTypes: ["semantic"],
    });
  });

  it("filters lifecycle states while treating blocked records as active", () => {
    const data = parsedData();
    const [architectureViolation] = data.violations;
    if (!architectureViolation) {
      throw new Error("Expected the architecture violation fixture.");
    }
    const blocked = {
      ...architectureViolation,
      id: "live-architecture",
      fingerprint: "architecture:live",
      status: "blocked" as const,
      resolvedAt: null,
    };
    const violations = [...data.violations, blocked];

    expect(filterViolations(violations, "all")).toHaveLength(3);
    expect(filterViolations(violations, "resolved").map((item) => item.id)).toEqual([
      "architecture",
      "semantic",
    ]);
    expect(filterViolations(violations, "active").map((item) => item.id)).toEqual([
      "live-architecture",
    ]);
  });

  it("fails safely rather than mapping malformed API JSON into product data", () => {
    const payloads = createPayloads();
    const summary = payloads.summary as Record<string, unknown>;
    summary.activeViolationCount = "not-a-number";

    expect(parseDashboardData(payloads)).toEqual({
      ok: false,
      error: "repository summary.activeViolationCount must be a finite number.",
    });
  });
});
