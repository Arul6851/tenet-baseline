import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ValidationRunIngestionSchema,
  type ValidationRunIngestion,
} from "@tenet/contracts";

import {
  createPostValidationRunHandler,
  type ValidationRunRouteDependencies,
} from "./route.js";

const createPayload = (): ValidationRunIngestion =>
  ValidationRunIngestionSchema.parse({
    version: 1,
    idempotencyKey: "4c5d25d3-72f0-4ba9-80d2-e85f232e81ae",
    repository: {
      slug: "commerce-platform",
      name: "commerce-platform",
      displayName: "acme/commerce-platform",
      defaultBranch: "main",
    },
    source: "cli",
    completedAt: "2026-07-21T12:00:00.000Z",
    status: "PASS",
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
    tenets: [
      {
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
    ],
    tenetEvaluations: [
      {
        tenetId: "checkout-persistence-boundary",
        status: "satisfied",
        summary: "Checkout persists through the gateway.",
        violationFingerprints: [],
      },
    ],
    violations: [],
    health: {
      architecture: { score: 100, deductions: [] },
      intent: { score: 100, deductions: [] },
    },
  });

const createRequest = (body: unknown): NextRequest =>
  new NextRequest("http://control-plane.test/api/validation-runs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const availableDependencies = (
  overrides: Partial<ValidationRunRouteDependencies> = {},
): ValidationRunRouteDependencies => ({
  isDatabaseConfigured: () => true,
  ingest: async () => ({
    repositoryId: "c8f27f41-3883-4c2b-9ea8-663e0933e753",
    validationRunId: "11f5dd7b-6ea1-411c-a57b-951f8e136f46",
    idempotent: false,
    resolvedViolationFingerprints: [],
  }),
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/validation-runs", () => {
  it("accepts a validated deterministic result and returns its persisted run", async () => {
    const payload = createPayload();
    const ingest = vi.fn(availableDependencies().ingest);
    const handler = createPostValidationRunHandler(availableDependencies({ ingest }));

    const response = await handler(createRequest(payload));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      validationRunId: "11f5dd7b-6ea1-411c-a57b-951f8e136f46",
      created: true,
    });
    expect(ingest).toHaveBeenCalledWith(payload);
  });

  it("rejects malformed payloads before invoking persistence", async () => {
    const ingest = vi.fn(availableDependencies().ingest);
    const handler = createPostValidationRunHandler(availableDependencies({ ingest }));
    const malformed = { ...createPayload() } as Record<string, unknown>;
    delete malformed.idempotencyKey;

    const response = await handler(createRequest(malformed));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_validation_run",
    });
    expect(ingest).not.toHaveBeenCalled();
  });

  it("returns unavailable without parsing or persisting when PostgreSQL is not configured", async () => {
    const ingest = vi.fn(availableDependencies().ingest);
    const handler = createPostValidationRunHandler(
      availableDependencies({ isDatabaseConfigured: () => false, ingest }),
    );

    const response = await handler(createRequest(createPayload()));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "control_plane_unavailable",
    });
    expect(ingest).not.toHaveBeenCalled();
  });

  it("returns the existing run for a repeated idempotency key", async () => {
    const payload = createPayload();
    const seenKeys = new Set<string>();
    const ingest = vi.fn(async (input: ValidationRunIngestion) => {
      const idempotent = seenKeys.has(input.idempotencyKey);
      seenKeys.add(input.idempotencyKey);

      return {
        repositoryId: "c8f27f41-3883-4c2b-9ea8-663e0933e753",
        validationRunId: "11f5dd7b-6ea1-411c-a57b-951f8e136f46",
        idempotent,
        resolvedViolationFingerprints: [],
      };
    });
    const handler = createPostValidationRunHandler(availableDependencies({ ingest }));

    const firstResponse = await handler(createRequest(payload));
    const repeatedResponse = await handler(createRequest(payload));

    expect(firstResponse.status).toBe(201);
    await expect(firstResponse.json()).resolves.toMatchObject({ created: true });
    expect(repeatedResponse.status).toBe(200);
    await expect(repeatedResponse.json()).resolves.toMatchObject({ created: false });
    expect(ingest).toHaveBeenCalledTimes(2);
  });
});
