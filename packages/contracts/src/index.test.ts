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

describe("TenetSchema", () => {
  it("accepts an enforceable direct-dependency tenet", () => {
    expect(TenetSchema.parse(architectureTenet)).toMatchObject({
      id: "checkout-boundary",
      enforcement: "block_merge",
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
