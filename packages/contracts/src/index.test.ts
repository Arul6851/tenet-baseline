import { describe, expect, it } from "vitest";

import { IntentProposalSchema, TenetSchema } from "./index.js";

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
