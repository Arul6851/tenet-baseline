import { describe, expect, it } from "vitest";

import { IntentProposalSchema } from "@tenet/contracts";

import {
  controlPlaneTenetExternalId,
  toRepositoryReference,
  type ManagedRepository,
} from "./tenet-activation";

const repository: ManagedRepository = {
  databaseId: "b44bccb3-f2a6-4239-9a02-6f1650cba29b",
  slug: "commerce-platform",
  name: "commerce-platform",
  displayName: "acme/commerce-platform",
  defaultBranch: "main",
};

const proposal = IntentProposalSchema.parse({
  sourceIntent: "Maximum combined customer discount must never exceed 30%.",
  proposedTenet: {
    name: "Maximum Combined Discount",
    description: "Maximum combined customer discount must never exceed 30%.",
    type: "business",
    severity: "critical",
    enforcement: "block_merge",
    status: "draft",
    scope: ["pricing", "loyalty"],
    constraint: {
      kind: "max_combined_discount",
      maximumPercent: 30,
      stackGroup: "customer",
      requireCombinable: true,
    },
  },
  rationale: "The specified threshold is supported by the deterministic discount validator.",
  assumptions: [],
  model: "gpt-5.6-terra",
  requiresHumanConfirmation: true,
});

describe("control-plane Tenet activation helpers", () => {
  it("derives a stable external ID for repeated confirmation of the same proposal", () => {
    const first = controlPlaneTenetExternalId(repository.slug, proposal);
    const second = controlPlaneTenetExternalId(repository.slug, proposal);

    expect(first).toBe(second);
    expect(first).toMatch(/^control-plane-[a-f0-9]{24}$/u);
  });

  it("scopes a proposal's deterministic identity to its repository", () => {
    expect(controlPlaneTenetExternalId("another-repository", proposal)).not.toBe(
      controlPlaneTenetExternalId(repository.slug, proposal),
    );
  });

  it("uses server-owned repository identity for AI interpretation", () => {
    expect(toRepositoryReference(repository)).toEqual({
      id: "commerce-platform",
      name: "commerce-platform",
      defaultBranch: "main",
    });
  });
});
