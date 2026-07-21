import { describe, expect, it, vi } from "vitest";

import {
  DeveloperExplanationRequestSchema,
  DeveloperExplanationSchema,
  type DeveloperExplanation,
} from "@tenet/contracts";

import {
  createPostViolationExplanationHandler,
  type ViolationExplanationRouteDependencies,
} from "./route.js";

const fingerprint = "architecture:checkout-persistence-boundary:checkout->database";
const explanationRequest = DeveloperExplanationRequestSchema.parse({
  tenet: {
    id: "checkout-persistence-boundary",
    name: "Checkout Persistence Boundary",
    description:
      "Checkout must access persistence through DatabaseGateway and must never directly depend on the database layer.",
    type: "architecture",
    severity: "critical",
    enforcement: "block_merge",
    status: "active",
    scope: ["checkout", "gateway", "database"],
    constraint: {
      kind: "forbid_direct_dependency",
      sourceModule: "checkout",
      targetModule: "database",
      expectedRoute: ["checkout", "gateway", "database"],
    },
  },
  violation: {
    fingerprint,
    tenetId: "checkout-persistence-boundary",
    tenetName: "Checkout Persistence Boundary",
    type: "architecture",
    severity: "critical",
    enforcement: "block_merge",
    status: "resolved",
    title: "Checkout directly depends on database",
    message: "Checkout directly imports the database module.",
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
      actualDependency: { sourceModule: "checkout", targetModule: "database" },
    },
  },
});

const explanation = DeveloperExplanationSchema.parse({
  violationFingerprint: fingerprint,
  summary: "Checkout imported the database client directly.",
  whyItMatters: "The import bypasses DatabaseGateway.",
  suggestedNextSteps: ["Route persistence through DatabaseGateway."],
  evidenceAcknowledged: [
    'src/checkout/checkout-service.ts imports "../database/raw-database-client.js".',
  ],
});

const context = {
  params: Promise.resolve({ repositoryId: "commerce-platform", fingerprint }),
};

const createDependencies = (
  overrides: Partial<ViolationExplanationRouteDependencies> = {},
): ViolationExplanationRouteDependencies => ({
  isDatabaseConfigured: () => true,
  isAiConfigured: () => true,
  findExplanationRequest: async () => explanationRequest,
  explain: async () => explanation,
  ...overrides,
});

describe("POST /api/repositories/:repositoryId/violations/:fingerprint/explanation", () => {
  it("asks GPT to explain only the server-loaded deterministic evidence", async () => {
    const findExplanationRequest = vi.fn(async () => explanationRequest);
    const explain = vi.fn(async () => explanation);
    const handler = createPostViolationExplanationHandler(
      createDependencies({ findExplanationRequest, explain }),
    );

    const response = await handler(
      new Request("http://control-plane.test/api/repositories/commerce-platform/violations/item/explanation", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ evidence: "untrusted client evidence is ignored" }),
      }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ explanation });
    expect(findExplanationRequest).toHaveBeenCalledWith("commerce-platform", fingerprint);
    expect(explain).toHaveBeenCalledWith(explanationRequest);
  });

  it("does not ask GPT when the deterministic violation cannot be loaded", async () => {
    const explain = vi.fn(async () => explanation);
    const handler = createPostViolationExplanationHandler(
      createDependencies({
        findExplanationRequest: async () => undefined,
        explain,
      }),
    );

    const response = await handler(new Request("http://control-plane.test"), context);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "violation_not_found" });
    expect(explain).not.toHaveBeenCalled();
  });

  it("does not ask GPT while the optional explanation service is unavailable", async () => {
    const explain = vi.fn(async () => explanation);
    const handler = createPostViolationExplanationHandler(
      createDependencies({ isAiConfigured: () => false, explain }),
    );

    const response = await handler(new Request("http://control-plane.test"), context);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "ai_unavailable" });
    expect(explain).not.toHaveBeenCalled();
  });

  it("rejects malformed explanatory output without touching the violation state", async () => {
    const handler = createPostViolationExplanationHandler(
      createDependencies({
        explain: async () => ({ summary: "Incomplete" }) as DeveloperExplanation,
      }),
    );

    const response = await handler(new Request("http://control-plane.test"), context);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "ai_explanation_failed" });
  });
});
