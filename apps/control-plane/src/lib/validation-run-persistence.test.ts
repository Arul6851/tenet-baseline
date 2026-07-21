import { describe, expect, it } from "vitest";

import { ViolationSchema, type HealthScore } from "@tenet/contracts";

import {
  buildHealthSnapshotPersistenceValues,
  buildViolationPersistenceSnapshot,
} from "./validation-run-persistence";

const architectureViolation = ViolationSchema.parse({
  fingerprint: "architecture:checkout:database",
  tenetId: "checkout-persistence-boundary",
  tenetName: "Checkout Persistence Boundary",
  tenetDescription:
    "Checkout must access persistence through DatabaseGateway and must never directly depend on the database layer.",
  type: "architecture",
  severity: "critical",
  enforcement: "block_merge",
  status: "blocked",
  title: "Checkout directly depends on database",
  message: "Checkout must use DatabaseGateway.",
  affectedFiles: ["src/checkout/checkout-service.ts"],
  evidence: [
    {
      kind: "import",
      file: "src/checkout/checkout-service.ts",
      line: 2,
      column: 1,
      excerpt: 'import { rawDatabaseClient } from "../database/raw-database-client.js";',
    },
  ],
  architectureFinding: "boundary_violation",
  architecture: {
    sourceModule: "checkout",
    targetModule: "database",
    expectedRoute: ["checkout", "gateway", "database"],
    actualDependency: {
      sourceModule: "checkout",
      targetModule: "database",
    },
  },
});

const semanticViolation = ViolationSchema.parse({
  fingerprint: "semantic:customer:max-combined-discount",
  tenetId: "maximum-combined-customer-discount",
  tenetName: "Maximum Combined Discount",
  tenetDescription: "Maximum combined customer discount must never exceed 30%.",
  type: "semantic",
  severity: "critical",
  enforcement: "block_merge",
  status: "blocked",
  title: "Combined customer discounts exceed the maximum",
  message: "Holiday and premium discounts can combine to 35%.",
  affectedFiles: [
    "src/pricing/discount-policy.ts",
    "src/loyalty/premium-loyalty-discount.ts",
  ],
  evidence: [
    {
      kind: "discount",
      file: "src/pricing/discount-policy.ts",
      line: 8,
      column: 14,
      excerpt: 'defineDiscount({ id: "holiday", percent: 20 })',
    },
  ],
  semantic: {
    kind: "max_combined_discount",
    stackGroup: "customer",
    maximumPercent: 30,
    potentialPercent: 35,
    contributingDiscounts: [
      {
        kind: "discount",
        id: "holiday",
        percent: 20,
        stackGroup: "customer",
        combinable: true,
        sourceFile: "src/pricing/discount-policy.ts",
        line: 8,
        column: 14,
        excerpt: 'defineDiscount({ id: "holiday", percent: 20 })',
      },
      {
        kind: "discount",
        id: "premium-loyalty",
        percent: 15,
        stackGroup: "customer",
        combinable: true,
        sourceFile: "src/loyalty/premium-loyalty-discount.ts",
        line: 7,
        column: 14,
        excerpt: 'defineDiscount({ id: "premium-loyalty", percent: 15 })',
      },
    ],
  },
});

const health = {
  architecture: {
    score: 95,
    deductions: [
      {
        key: architectureViolation.fingerprint,
        label: "Direct boundary violation",
        amount: 5,
        reason: "Checkout directly imports the database module.",
      },
    ],
  } satisfies HealthScore,
  intent: {
    score: 0,
    deductions: [
      {
        key: semanticViolation.tenetId,
        label: "Tenet is violated",
        amount: 100,
        reason: "35% exceeds the configured 30% maximum.",
      },
    ],
  } satisfies HealthScore,
};

describe("validation-run persistence projections", () => {
  it("retains structured architecture and semantic evidence with deterministic health impact", () => {
    const architecture = buildViolationPersistenceSnapshot(
      architectureViolation,
      health,
    );
    const semantic = buildViolationPersistenceSnapshot(semanticViolation, health);

    expect(architecture.details).toMatchObject({
      architecture: architectureViolation.architecture,
      architectureFinding: "boundary_violation",
    });
    expect(architecture.healthImpact).toEqual({
      architecture: health.architecture.deductions,
      intent: [],
    });
    expect(semantic.details).toMatchObject({ semantic: semanticViolation.semantic });
    expect(semantic.healthImpact).toEqual({
      architecture: [],
      intent: health.intent.deductions,
    });
  });

  it("maps exact deterministic health scores and breakdowns to a dated snapshot", () => {
    const completedAt = new Date("2026-07-21T12:00:00.000Z");
    const values = buildHealthSnapshotPersistenceValues(
      "repository-id",
      "validation-run-id",
      health,
      completedAt,
    );

    expect(values).toEqual({
      repositoryId: "repository-id",
      validationRunId: "validation-run-id",
      architectureScore: 95,
      intentScore: 0,
      architectureBreakdown: health.architecture.deductions,
      intentBreakdown: health.intent.deductions,
      validatedAt: completedAt,
    });
  });
});
