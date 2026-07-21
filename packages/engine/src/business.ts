import type {
  DiscountFact,
  Tenet,
  TenetEvaluation,
  Violation,
} from "@tenet/contracts";

import type { RepositoryAnalysis } from "./analysis.js";

export interface BusinessValidationInput {
  analysis: RepositoryAnalysis;
  tenets: readonly Tenet[];
}

export interface BusinessValidationResult {
  violations: readonly Violation[];
  evaluations: readonly TenetEvaluation[];
}

interface BusinessInvariantValidationInput {
  analysis: RepositoryAnalysis;
  tenet: Tenet;
}

interface BusinessInvariantValidationResult {
  violations: readonly Violation[];
  evaluation: TenetEvaluation;
}

/**
 * Deterministic business invariants are intentionally isolated behind this
 * interface. New supported invariant kinds can be added without granting any
 * validator authority to infer an unsupported business rule.
 */
export interface BusinessInvariantValidator {
  supports(tenet: Tenet): boolean;
  validate(
    input: BusinessInvariantValidationInput,
  ): BusinessInvariantValidationResult;
}

const unique = (items: readonly string[]): string[] => [...new Set(items)].sort();

const violationStatusFor = (tenet: Tenet): "active" | "blocked" =>
  tenet.enforcement === "block_merge" ? "blocked" : "active";

const discountIdentity = (discount: DiscountFact): string =>
  `${discount.stackGroup}\u0000${discount.id}`;

const discountSignature = (discount: DiscountFact): string =>
  `${discount.percent}\u0000${discount.combinable}\u0000${discount.name ?? ""}`;

const orderedDiscounts = (
  discounts: readonly DiscountFact[],
): DiscountFact[] =>
  [...discounts].sort(
    (left, right) =>
      left.id.localeCompare(right.id) ||
      left.sourceFile.localeCompare(right.sourceFile) ||
      left.line - right.line ||
      left.column - right.column,
  );

/**
 * Protects the invariant from callers that provide duplicate facts directly.
 * Identical declarations count once; conflicting declarations are uncertain
 * and are excluded rather than guessed at.
 */
const unambiguousDiscounts = (
  discounts: readonly DiscountFact[],
): DiscountFact[] => {
  const byIdentity = new Map<string, DiscountFact[]>();

  for (const discount of discounts) {
    const identity = discountIdentity(discount);
    const occurrences = byIdentity.get(identity);
    if (occurrences) {
      occurrences.push(discount);
    } else {
      byIdentity.set(identity, [discount]);
    }
  }

  const selected: DiscountFact[] = [];
  for (const occurrences of byIdentity.values()) {
    const ordered = orderedDiscounts(occurrences);
    const [canonical] = ordered;
    if (!canonical) {
      continue;
    }

    if (new Set(ordered.map(discountSignature)).size === 1) {
      selected.push(canonical);
    }
  }

  return orderedDiscounts(selected);
};

const evidenceFor = (discount: DiscountFact) => ({
  kind: "discount" as const,
  file: discount.sourceFile,
  line: discount.line,
  column: discount.column,
  excerpt: discount.excerpt,
});

/**
 * P0 deterministic business invariant for literal defineDiscount declarations.
 * It never evaluates code or fills in missing values: only extracted literal
 * facts participate in a blocking calculation.
 */
export class MaxCombinedDiscountValidator implements BusinessInvariantValidator {
  supports(tenet: Tenet): boolean {
    return (
      tenet.type === "business" &&
      tenet.constraint.kind === "max_combined_discount"
    );
  }

  validate(
    input: BusinessInvariantValidationInput,
  ): BusinessInvariantValidationResult {
    const { analysis, tenet } = input;

    if (tenet.constraint.kind !== "max_combined_discount") {
      throw new Error(
        "MaxCombinedDiscountValidator received an unsupported Tenet constraint.",
      );
    }

    const constraint = tenet.constraint;
    const contributingDiscounts = unambiguousDiscounts(
      analysis.discounts.filter(
        (discount) =>
          discount.stackGroup === constraint.stackGroup &&
          (discount.sourceModule === undefined ||
            tenet.scope.includes(discount.sourceModule)) &&
          (!constraint.requireCombinable || discount.combinable),
      ),
    );
    const potentialPercent = contributingDiscounts.reduce(
      (total, discount) => total + discount.percent,
      0,
    );

    if (potentialPercent <= constraint.maximumPercent) {
      return {
        violations: [],
        evaluation: {
          tenetId: tenet.id,
          status: "satisfied",
          summary: `${tenet.name} is satisfied.`,
          violationFingerprints: [],
        },
      };
    }

    const fingerprint = `semantic:${tenet.id}:max_combined_discount:${constraint.stackGroup}`;
    const message = `${tenet.name} permits a potential ${potentialPercent}% ${constraint.stackGroup} discount, above the ${constraint.maximumPercent}% maximum.`;
    const violation: Violation = {
      fingerprint,
      tenetId: tenet.id,
      tenetName: tenet.name,
      tenetDescription: tenet.description,
      type: "semantic",
      severity: tenet.severity,
      enforcement: tenet.enforcement,
      status: violationStatusFor(tenet),
      title: "Semantic conflict detected",
      message,
      affectedFiles: unique(
        contributingDiscounts.map((discount) => discount.sourceFile),
      ),
      evidence: contributingDiscounts.map(evidenceFor),
      semantic: {
        kind: "max_combined_discount",
        stackGroup: constraint.stackGroup,
        maximumPercent: constraint.maximumPercent,
        potentialPercent,
        contributingDiscounts,
      },
    };

    return {
      violations: [violation],
      evaluation: {
        tenetId: tenet.id,
        status: "violated",
        summary: message,
        violationFingerprints: [fingerprint],
      },
    };
  }
}

const businessInvariantValidators: readonly BusinessInvariantValidator[] = [
  new MaxCombinedDiscountValidator(),
];

/**
 * Runs each active, supported business Tenet through deterministic invariant
 * validators. Unsupported facts are warnings from analysis, never violations.
 */
export const validateBusinessTenets = (
  input: BusinessValidationInput,
): BusinessValidationResult => {
  const violations: Violation[] = [];
  const evaluations: TenetEvaluation[] = [];

  for (const tenet of input.tenets) {
    if (tenet.type !== "business" || tenet.status !== "active") {
      continue;
    }

    const validator = businessInvariantValidators.find((candidate) =>
      candidate.supports(tenet),
    );
    if (!validator) {
      evaluations.push({
        tenetId: tenet.id,
        status: "at_risk",
        summary: `${tenet.name} uses an unsupported deterministic business invariant.`,
        violationFingerprints: [],
      });
      continue;
    }

    const validation = validator.validate({ analysis: input.analysis, tenet });
    violations.push(...validation.violations);
    evaluations.push(validation.evaluation);
  }

  return {
    violations: violations.sort((left, right) =>
      left.fingerprint.localeCompare(right.fingerprint),
    ),
    evaluations: evaluations.sort((left, right) =>
      left.tenetId.localeCompare(right.tenetId),
    ),
  };
};
