import { zodTextFormat } from "openai/helpers/zod";
import { describe, expect, it } from "vitest";

import {
  normalizeOpenAiDeveloperExplanation,
  normalizeOpenAiIntentProposal,
  OpenAiDeveloperExplanationOutputSchema,
  OpenAiIntentProposalOutputSchema,
} from "./openai-output-schema.js";

const sourceIntent =
  "Checkout should never access the database directly. It must go through DatabaseGateway.";

const architectureOutput = {
  proposedTenet: {
    name: "Checkout Persistence Boundary",
    description: sourceIntent,
    type: "architecture" as const,
    severity: "high" as const,
    enforcement: "block_merge" as const,
    status: "draft" as const,
    scope: ["checkout", "gateway", "database"],
    constraint: {
      kind: "forbid_direct_dependency" as const,
      sourceModule: "checkout",
      targetModule: "database",
      requiredIntermediary: "gateway",
    },
  },
  rationale: "The direct database import would bypass the configured gateway.",
  assumptions: ["The configured module IDs use lowercase names."],
};

const businessOutput = {
  proposedTenet: {
    name: "Maximum Combined Discount",
    description: "Customer discounts that can be combined must never exceed 30 percent in total.",
    type: "business" as const,
    severity: "critical" as const,
    enforcement: "block_merge" as const,
    status: "draft" as const,
    scope: ["pricing", "loyalty"],
    constraint: {
      kind: "max_combined_discount" as const,
      maximumPercent: 30,
      stackGroup: "customer",
      requireCombinable: true,
    },
  },
  rationale: "The combined customer discount has a deterministic numeric cap.",
  assumptions: ["Only combinable customer discounts contribute to this cap."],
};

describe("OpenAI Structured Outputs boundary", () => {
  it("creates a Structured Outputs-compatible format with no optional generated fields", () => {
    expect(() =>
      zodTextFormat(
        OpenAiIntentProposalOutputSchema,
        "tenet_intent_proposal",
      ),
    ).not.toThrow();
    expect(() =>
      zodTextFormat(
        OpenAiDeveloperExplanationOutputSchema,
        "deterministic_violation_explanation",
      ),
    ).not.toThrow();
  });

  it("normalizes a valid architecture proposal while preserving its expected route", () => {
    const proposal = normalizeOpenAiIntentProposal(
      architectureOutput,
      sourceIntent,
      "gpt-5.6-terra",
    );

    expect(proposal).toMatchObject({
      sourceIntent,
      model: "gpt-5.6-terra",
      requiresHumanConfirmation: true,
      proposedTenet: {
        type: "architecture",
        status: "draft",
        constraint: {
          kind: "forbid_direct_dependency",
          sourceModule: "checkout",
          targetModule: "database",
          expectedRoute: ["checkout", "gateway", "database"],
        },
      },
    });
  });

  it("normalizes a nullable required intermediary back to the optional domain representation", () => {
    const proposal = normalizeOpenAiIntentProposal(
      {
        ...architectureOutput,
        proposedTenet: {
          ...architectureOutput.proposedTenet,
          constraint: {
            ...architectureOutput.proposedTenet.constraint,
            requiredIntermediary: null,
          },
        },
      },
      sourceIntent,
      "gpt-5.6-terra",
    );

    expect(proposal.proposedTenet.constraint).toEqual({
      kind: "forbid_direct_dependency",
      sourceModule: "checkout",
      targetModule: "database",
    });
  });

  it("normalizes a valid business proposal into the deterministic discount invariant", () => {
    const proposal = normalizeOpenAiIntentProposal(
      businessOutput,
      businessOutput.proposedTenet.description,
      "gpt-5.6-terra",
    );

    expect(proposal).toMatchObject({
      proposedTenet: {
        type: "business",
        status: "draft",
        constraint: {
          kind: "max_combined_discount",
          maximumPercent: 30,
          stackGroup: "customer",
          requireCombinable: true,
        },
      },
      requiresHumanConfirmation: true,
    });
  });

  it("rejects missing, unsupported, and canonically invalid generated proposals", () => {
    const missingNullableField = {
      ...architectureOutput,
      proposedTenet: {
        ...architectureOutput.proposedTenet,
        constraint: {
          kind: "forbid_direct_dependency",
          sourceModule: "checkout",
          targetModule: "database",
        },
      },
    };
    const unsupportedConstraint = {
      ...architectureOutput,
      proposedTenet: {
        ...architectureOutput.proposedTenet,
        constraint: {
          kind: "allow_only_dependencies",
          sourceModule: "checkout",
          allowedTargetModules: ["gateway"],
        },
      },
    };
    const emptyScope = {
      ...businessOutput,
      proposedTenet: { ...businessOutput.proposedTenet, scope: [] },
    };
    const injectedSafetyMetadata = {
      ...architectureOutput,
      sourceIntent: "Model-controlled metadata is not accepted.",
    };
    const invalidMaximum = {
      ...businessOutput,
      proposedTenet: {
        ...businessOutput.proposedTenet,
        constraint: {
          ...businessOutput.proposedTenet.constraint,
          maximumPercent: 101,
        },
      },
    };

    expect(OpenAiIntentProposalOutputSchema.safeParse(missingNullableField).success).toBe(false);
    expect(OpenAiIntentProposalOutputSchema.safeParse(unsupportedConstraint).success).toBe(false);
    expect(OpenAiIntentProposalOutputSchema.safeParse(injectedSafetyMetadata).success).toBe(false);
    expect(() =>
      normalizeOpenAiIntentProposal(emptyScope, sourceIntent, "gpt-5.6-terra"),
    ).toThrow();
    expect(() =>
      normalizeOpenAiIntentProposal(invalidMaximum, sourceIntent, "gpt-5.6-terra"),
    ).toThrow();
  });

  it("strictly validates model explanations after parsing the required output shape", () => {
    const explanation = normalizeOpenAiDeveloperExplanation({
      violationFingerprint: "semantic:maximum-combined-discount:customer",
      summary: "Holiday and premium loyalty discounts can stack to 35%.",
      whyItMatters: "That exceeds the configured 30% customer-discount cap.",
      suggestedNextSteps: ["Make one discount non-combinable."],
      evidenceAcknowledged: ["20% + 15% = 35%"],
    });

    expect(explanation.violationFingerprint).toBe(
      "semantic:maximum-combined-discount:customer",
    );
    expect(() =>
      normalizeOpenAiDeveloperExplanation({
        violationFingerprint: "semantic:maximum-combined-discount:customer",
        summary: "Incomplete",
        whyItMatters: "",
        suggestedNextSteps: [],
        evidenceAcknowledged: [],
      }),
    ).toThrow();
  });
});
