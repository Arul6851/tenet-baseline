import { describe, expect, it } from "vitest";

import {
  IntentProposalSchema,
  TenetSchema,
  ValidationRunIngestionSchema,
} from "./index.js";

const architectureTenet = {
  id: "checkout-boundary",
  name: "Checkout database boundary",
  description: "Checkout must persist through DatabaseGateway.",
  type: "architecture" as const,
  severity: "critical" as const,
  enforcement: "block_merge" as const,
  status: "active" as const,
  scope: ["checkout", "gateway", "database"],
  constraint: {
    kind: "forbid_direct_dependency" as const,
    sourceModule: "checkout",
    targetModule: "database",
    expectedRoute: ["checkout", "gateway", "database"],
  },
};

const businessTenet = {
  id: "maximum-combined-customer-discount",
  name: "Maximum Combined Discount",
  description: "Maximum combined customer discount must never exceed 30%.",
  type: "business" as const,
  severity: "critical" as const,
  enforcement: "block_merge" as const,
  status: "active" as const,
  scope: ["pricing", "loyalty"],
  constraint: {
    kind: "max_combined_discount" as const,
    maximumPercent: 30,
    stackGroup: "customer",
  },
};

const validationRunPayload = {
  version: 1 as const,
  idempotencyKey: "e01b41cc-68e1-4d41-8134-32c76d670a1f",
  repository: {
    slug: "commerce-platform",
    name: "commerce-platform",
    displayName: "acme/commerce-platform",
    defaultBranch: "main",
  },
  source: "cli" as const,
  completedAt: "2026-07-21T12:00:00.000Z",
  status: "PASS" as const,
  git: {},
  analyzerVersion: "tenet-ts-morph-v1",
  changedFiles: [],
  warnings: [],
  architecture: {
    modules: [
      { id: "checkout", paths: ["src/checkout/**"] },
      { id: "gateway", paths: ["src/gateway/**"] },
      { id: "database", paths: ["src/database/**"] },
    ],
    intendedEdges: [
      ["checkout", "gateway"],
      ["gateway", "database"],
    ],
    allowedEdges: [
      { sourceModule: "checkout", targetModule: "gateway" },
      { sourceModule: "gateway", targetModule: "database" },
    ],
  },
  graph: {
    nodes: [
      { id: "checkout", paths: ["src/checkout/**"] },
      { id: "gateway", paths: ["src/gateway/**"] },
      { id: "database", paths: ["src/database/**"] },
    ],
    edges: [],
  },
  tenets: [architectureTenet, businessTenet],
  tenetEvaluations: [
    {
      tenetId: architectureTenet.id,
      status: "satisfied" as const,
      summary: "Boundary is intact.",
      violationFingerprints: [],
    },
    {
      tenetId: businessTenet.id,
      status: "satisfied" as const,
      summary: "Discount cap is intact.",
      violationFingerprints: [],
    },
  ],
  violations: [],
  health: {
    architecture: { score: 100, deductions: [] },
    intent: { score: 100, deductions: [] },
  },
};

describe("TenetSchema", () => {
  it("accepts an enforceable direct-dependency tenet", () => {
    expect(TenetSchema.parse(architectureTenet)).toMatchObject({
      id: "checkout-boundary",
      enforcement: "block_merge",
    });
  });

  it("accepts an enforceable combined-discount business tenet", () => {
    expect(TenetSchema.parse(businessTenet)).toMatchObject({
      id: "maximum-combined-customer-discount",
      type: "business",
      constraint: {
        kind: "max_combined_discount",
        maximumPercent: 30,
        stackGroup: "customer",
        requireCombinable: true,
      },
    });
  });

  it("accepts a complete deterministic validation-ingestion payload", () => {
    expect(ValidationRunIngestionSchema.parse(validationRunPayload)).toMatchObject({
      idempotencyKey: validationRunPayload.idempotencyKey,
      repository: { slug: "commerce-platform" },
      status: "PASS",
      health: { architecture: { score: 100 }, intent: { score: 100 } },
    });
  });

  it("rejects malformed validation-ingestion payloads", () => {
    const missingKey = { ...validationRunPayload } as Record<string, unknown>;
    delete missingKey.idempotencyKey;

    expect(() => ValidationRunIngestionSchema.parse(missingKey)).toThrow();
  });

  it("rejects relationally invalid deterministic evidence before persistence", () => {
    const invalidEvidence = {
      ...validationRunPayload,
      tenetEvaluations: [
        {
          tenetId: "missing-tenet",
          status: "violated" as const,
          summary: "This reference must be rejected.",
          violationFingerprints: ["unknown-fingerprint"],
        },
      ],
    };

    expect(() => ValidationRunIngestionSchema.parse(invalidEvidence)).toThrow(
      /unknown Tenet/u,
    );
  });

  it("requires human confirmation for AI-proposed tenets", () => {
    const proposedTenet = {
      name: architectureTenet.name,
      description: architectureTenet.description,
      type: architectureTenet.type,
      severity: architectureTenet.severity,
      enforcement: architectureTenet.enforcement,
      status: "draft" as const,
      scope: architectureTenet.scope,
      constraint: architectureTenet.constraint,
    };

    expect(() =>
      IntentProposalSchema.parse({
        sourceIntent: architectureTenet.description,
        proposedTenet,
        rationale: "The requested boundary maps to a direct dependency rule.",
        assumptions: [],
        model: "gpt-5.6-terra",
        requiresHumanConfirmation: false,
      }),
    ).toThrow();
  });
});
