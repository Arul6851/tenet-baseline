import type {
  ArchitectureFindingKind,
  HealthDeduction,
  HealthScore,
  TenetEvaluation,
} from "@tenet/contracts";

export interface ArchitectureFinding {
  fingerprint: string;
  kind: ArchitectureFindingKind;
  reason: string;
}

const architectureDeductions: Record<
  ArchitectureFindingKind,
  Omit<HealthDeduction, "key" | "reason">
> = {
  boundary_violation: {
    label: "Direct boundary violation",
    amount: 5,
  },
  circular_dependency: {
    label: "Circular dependency",
    amount: 8,
  },
  unauthorized_cross_layer: {
    label: "Unauthorized cross-layer dependency",
    amount: 3,
  },
  architectural_drift: {
    label: "Undeclared architectural drift",
    amount: 2,
  },
};

const clampScore = (value: number): number => Math.min(100, Math.max(0, value));

export const calculateArchitectureHealth = (
  findings: readonly ArchitectureFinding[],
): HealthScore => {
  const fingerprints = new Set<string>();
  const deductions: HealthDeduction[] = [];

  for (const finding of [...findings].sort((left, right) =>
    left.fingerprint.localeCompare(right.fingerprint),
  )) {
    if (fingerprints.has(finding.fingerprint)) {
      continue;
    }

    fingerprints.add(finding.fingerprint);
    const deduction = architectureDeductions[finding.kind];
    deductions.push({
      key: finding.fingerprint,
      label: deduction.label,
      amount: deduction.amount,
      reason: finding.reason,
    });
  }

  const total = deductions.reduce((sum, deduction) => sum + deduction.amount, 0);
  return { score: clampScore(100 - total), deductions };
};

const contributionFor = (evaluation: TenetEvaluation): number => {
  switch (evaluation.status) {
    case "satisfied":
      return 1;
    case "at_risk":
      return 0.5;
    case "violated":
      return 0;
  }
};

export const calculateIntentHealth = (
  evaluations: readonly TenetEvaluation[],
): HealthScore => {
  const byTenet = new Map<string, TenetEvaluation>();

  for (const evaluation of evaluations) {
    if (!byTenet.has(evaluation.tenetId)) {
      byTenet.set(evaluation.tenetId, evaluation);
    }
  }

  const uniqueEvaluations = [...byTenet.values()].sort((left, right) =>
    left.tenetId.localeCompare(right.tenetId),
  );

  if (uniqueEvaluations.length === 0) {
    return { score: 100, deductions: [] };
  }

  const contributions = uniqueEvaluations.reduce(
    (sum, evaluation) => sum + contributionFor(evaluation),
    0,
  );
  const deductions = uniqueEvaluations.flatMap<HealthDeduction>((evaluation) => {
    if (evaluation.status === "satisfied") {
      return [];
    }

    return [
      {
        key: evaluation.tenetId,
        label:
          evaluation.status === "at_risk"
            ? "Tenet is at risk"
            : "Tenet is violated",
        amount: evaluation.status === "at_risk" ? 50 : 100,
        reason: evaluation.summary,
      },
    ];
  });

  return {
    score: Math.round((contributions / uniqueEvaluations.length) * 100),
    deductions,
  };
};
