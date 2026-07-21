import { describe, expect, it } from "vitest";

import {
  calculateArchitectureHealth,
  calculateIntentHealth,
} from "./health.js";
import { deriveValidationStatus } from "./validation.js";

describe("architecture health", () => {
  it("deduplicates an architectural defect by fingerprint", () => {
    const health = calculateArchitectureHealth([
      {
        fingerprint: "checkout->database",
        kind: "boundary_violation",
        reason: "Checkout imports RawDatabaseClient.",
      },
      {
        fingerprint: "checkout->database",
        kind: "boundary_violation",
        reason: "Duplicate source observation.",
      },
    ]);

    expect(health).toEqual({
      score: 95,
      deductions: [
        {
          key: "checkout->database",
          label: "Direct boundary violation",
          amount: 5,
          reason: "Checkout imports RawDatabaseClient.",
        },
      ],
    });
  });
});

describe("intent health", () => {
  it("uses satisfied=1, at-risk=0.5, violated=0", () => {
    const health = calculateIntentHealth([
      {
        tenetId: "architecture",
        status: "satisfied",
        summary: "Boundary is intact.",
        violationFingerprints: [],
      },
      {
        tenetId: "discount-cap",
        status: "at_risk",
        summary: "A dynamic discount could not be evaluated.",
        violationFingerprints: [],
      },
      {
        tenetId: "payment-idempotency",
        status: "violated",
        summary: "Idempotency key is missing.",
        violationFingerprints: ["payment-idempotency"],
      },
    ]);

    expect(health.score).toBe(50);
    expect(health.deductions).toHaveLength(2);
  });
});

describe("validation status", () => {
  it("blocks only deterministic blocking violations", () => {
    expect(
      deriveValidationStatus([
        {
          fingerprint: "checkout->database",
          tenetId: "checkout-boundary",
          type: "architecture",
          severity: "critical",
          enforcement: "block_merge",
          status: "blocked",
          title: "Architectural drift detected",
          message: "Checkout bypasses DatabaseGateway.",
          affectedFiles: ["src/checkout/checkout-service.ts"],
          evidence: [
            {
              kind: "import",
              file: "src/checkout/checkout-service.ts",
              excerpt: "RawDatabaseClient",
            },
          ],
          architectureFinding: "boundary_violation",
        },
      ]),
    ).toBe("BLOCK");
  });
});
