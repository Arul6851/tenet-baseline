import type {
  ArchitectureFindingKind,
  DependencyEdge,
  Tenet,
  TenetEvaluation,
  Violation,
} from "@tenet/contracts";

import type { ArchitectureFinding } from "./health.js";
import type { RepositoryAnalysis } from "./analysis.js";

export interface ArchitectureValidationInput {
  analysis: RepositoryAnalysis;
  tenets: readonly Tenet[];
}

export interface ArchitectureValidationResult {
  violations: readonly Violation[];
  evaluations: readonly TenetEvaluation[];
  findings: readonly ArchitectureFinding[];
}

interface DirectDependencyRule {
  tenet: Tenet;
  sourceModule: string;
  targetModule: string;
  expectedRoute: readonly string[];
  finding: ArchitectureFindingKind;
}

const runtimeEdgesFor = (
  analysis: RepositoryAnalysis,
  sourceModule: string,
  targetModule: string,
): DependencyEdge[] =>
  analysis.edges.filter(
    (edge) =>
      edge.importKind === "runtime" &&
      edge.sourceModule === sourceModule &&
      edge.targetModule === targetModule,
  );

const rulesForTenet = (tenet: Tenet): readonly DirectDependencyRule[] => {
  if (tenet.type !== "architecture" || tenet.status !== "active") {
    return [];
  }

  if (tenet.constraint.kind !== "forbid_direct_dependency") {
    return [];
  }

  return [
    {
      tenet,
      sourceModule: tenet.constraint.sourceModule,
      targetModule: tenet.constraint.targetModule,
      expectedRoute:
        tenet.constraint.expectedRoute ?? [
          tenet.constraint.sourceModule,
          tenet.constraint.targetModule,
        ],
      finding: "boundary_violation",
    },
  ];
};

const violationStatusFor = (tenet: Tenet): "active" | "blocked" =>
  tenet.enforcement === "block_merge" ? "blocked" : "active";

const unique = (items: readonly string[]): string[] => [...new Set(items)].sort();

const createViolation = (
  rule: DirectDependencyRule,
  edges: readonly DependencyEdge[],
): Violation => {
  const [primaryEdge] = edges;

  if (!primaryEdge) {
    throw new Error("A violation requires at least one direct dependency edge.");
  }

  const fingerprint = `architecture:${rule.tenet.id}:${rule.sourceModule}->${rule.targetModule}`;

  return {
    fingerprint,
    tenetId: rule.tenet.id,
    tenetName: rule.tenet.name,
    tenetDescription: rule.tenet.description,
    type: "architecture",
    severity: rule.tenet.severity,
    enforcement: rule.tenet.enforcement,
    status: violationStatusFor(rule.tenet),
    title: "Architectural drift detected",
    message: `${rule.sourceModule} directly depends on ${rule.targetModule}, violating ${rule.tenet.name}.`,
    affectedFiles: unique(edges.map((edge) => edge.sourceFile)),
    evidence: edges.map((edge) => ({
      kind: "import" as const,
      file: edge.sourceFile,
      ...(edge.line === undefined ? {} : { line: edge.line }),
      ...(edge.column === undefined ? {} : { column: edge.column }),
      excerpt: `import "${edge.importSpecifier}"`,
    })),
    architectureFinding: rule.finding,
    architecture: {
      sourceModule: rule.sourceModule,
      targetModule: rule.targetModule,
      expectedRoute: [...rule.expectedRoute],
      actualDependency: {
        sourceModule: primaryEdge.sourceModule,
        targetModule: primaryEdge.targetModule,
      },
    },
  };
};

/**
 * Enforces direct architecture boundaries against a normalized dependency graph.
 * A group of duplicate source imports produces one stable edge-level violation.
 */
export const validateArchitectureTenets = (
  input: ArchitectureValidationInput,
): ArchitectureValidationResult => {
  const violations: Violation[] = [];
  const consumedEdges = new Set<string>();

  for (const tenet of input.tenets) {
    for (const rule of rulesForTenet(tenet)) {
      const matchingEdges = runtimeEdgesFor(
        input.analysis,
        rule.sourceModule,
        rule.targetModule,
      );

      if (matchingEdges.length === 0) {
        continue;
      }

      const edgeKey = `${rule.sourceModule}->${rule.targetModule}`;

      if (consumedEdges.has(edgeKey)) {
        continue;
      }

      consumedEdges.add(edgeKey);
      violations.push(createViolation(rule, matchingEdges));
    }
  }

  const activeArchitectureTenets = input.tenets.filter(
    (tenet) => tenet.type === "architecture" && tenet.status === "active",
  );
  const evaluations: TenetEvaluation[] = activeArchitectureTenets.map((tenet) => {
    const tenetViolations = violations.filter(
      (violation) => violation.tenetId === tenet.id,
    );

    if (tenetViolations.length === 0) {
      return {
        tenetId: tenet.id,
        status: "satisfied",
        summary: `${tenet.name} is satisfied.`,
        violationFingerprints: [],
      };
    }

    return {
      tenetId: tenet.id,
      status: "violated",
      summary: `${tenet.name} has ${tenetViolations.length} direct dependency violation${tenetViolations.length === 1 ? "" : "s"}.`,
      violationFingerprints: tenetViolations.map(
        (violation) => violation.fingerprint,
      ),
    };
  });

  return {
    violations,
    evaluations,
    findings: violations.map((violation) => ({
      fingerprint: violation.fingerprint,
      kind: violation.architectureFinding ?? "architectural_drift",
      reason: violation.message,
    })),
  };
};
