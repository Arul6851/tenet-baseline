import { describe, expect, it, vi } from "vitest";

import { DeveloperExplanationRequestSchema } from "@tenet/contracts";

import {
  explainPersistedViolation,
  toDeveloperExplanationRequest,
} from "./violation-explanation";

const fingerprint = "semantic:maximum-combined-discount:customer";
const request = DeveloperExplanationRequestSchema.parse({
  tenet: {
    id: "maximum-combined-customer-discount",
    name: "Maximum Combined Discount",
    description: "Maximum combined customer discount must never exceed 30%.",
    type: "business",
    severity: "critical",
    enforcement: "block_merge",
    status: "active",
    scope: ["pricing", "loyalty"],
    constraint: {
      kind: "max_combined_discount",
      maximumPercent: 30,
      stackGroup: "customer",
      requireCombinable: true,
    },
  },
  violation: {
    fingerprint,
    tenetId: "maximum-combined-customer-discount",
    type: "semantic",
    severity: "critical",
    enforcement: "block_merge",
    status: "blocked",
    title: "Combined customer discount exceeds the maximum",
    message: "35% exceeds the configured maximum of 30%.",
    affectedFiles: [
      "src/pricing/holiday-discount.ts",
      "src/loyalty/premium-loyalty-discount.ts",
    ],
    evidence: [
      {
        kind: "discount",
        file: "src/pricing/holiday-discount.ts",
        line: 4,
        column: 1,
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
          sourceFile: "src/pricing/holiday-discount.ts",
          line: 4,
          column: 1,
          excerpt: 'defineDiscount({ id: "holiday", percent: 20 })',
        },
        {
          kind: "discount",
          id: "premium-loyalty",
          percent: 15,
          stackGroup: "customer",
          combinable: true,
          sourceFile: "src/loyalty/premium-loyalty-discount.ts",
          line: 4,
          column: 1,
          excerpt: 'defineDiscount({ id: "premium-loyalty", percent: 15 })',
        },
      ],
    },
  },
});

describe("explainPersistedViolation", () => {
  it("validates persisted deterministic evidence before it can reach GPT", () => {
    const persisted = {
      fingerprint: request.violation.fingerprint,
      violationType: request.violation.type,
      violationSeverity: request.violation.severity,
      violationEnforcement: request.violation.enforcement,
      violationStatus: request.violation.status,
      title: request.violation.title,
      message: request.violation.message,
      affectedFiles: request.violation.affectedFiles,
      evidence: request.violation.evidence,
      details: { semantic: request.violation.semantic },
      tenetExternalId: request.tenet.id,
      tenetName: request.tenet.name,
      tenetDescription: request.tenet.description,
      tenetType: request.tenet.type,
      tenetSeverity: request.tenet.severity,
      tenetEnforcement: request.tenet.enforcement,
      tenetStatus: request.tenet.status,
      tenetScope: request.tenet.scope,
      tenetConstraint: request.tenet.constraint,
    };

    expect(toDeveloperExplanationRequest(persisted)).toMatchObject({
      tenet: request.tenet,
      violation: {
        ...request.violation,
        tenetName: request.tenet.name,
        tenetDescription: request.tenet.description,
      },
    });
    expect(() =>
      toDeveloperExplanationRequest({ ...persisted, evidence: [] }),
    ).toThrow();
  });

  it("passes only the validated deterministic request to the explainer", async () => {
    const explainer = {
      explainViolation: vi.fn(async () => ({
        violationFingerprint: fingerprint,
        summary: "Holiday and premium loyalty discounts can stack.",
        whyItMatters: "The combined discount reaches 35%, exceeding the cap.",
        suggestedNextSteps: ["Make one discount non-combinable."],
        evidenceAcknowledged: ["20% + 15% = 35%"],
      })),
    };

    const explanation = await explainPersistedViolation(explainer, request);

    expect(explainer.explainViolation).toHaveBeenCalledWith(request);
    expect(explanation.violationFingerprint).toBe(fingerprint);
  });

  it("rejects an AI response that acknowledges a different violation", async () => {
    const explainer = {
      explainViolation: async () => ({
        violationFingerprint: "another-violation",
        summary: "Wrong target.",
        whyItMatters: "Wrong target.",
        suggestedNextSteps: ["Do not use this response."],
        evidenceAcknowledged: ["Wrong target."],
      }),
    };

    await expect(explainPersistedViolation(explainer, request)).rejects.toThrow(
      /did not acknowledge/u,
    );
  });
});
