import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import {
  IntentProposalSchema,
  type IntentProposal,
} from "@tenet/contracts";

import type { ManagedRepository } from "../../../../../lib/tenet-activation";
import {
  createPostTenetProposalHandler,
  type TenetProposalRouteDependencies,
} from "./route.js";

const repository: ManagedRepository = {
  databaseId: "8e3a8d4a-1cbd-42e4-8e8a-4b073fe0b04f",
  slug: "commerce-platform",
  name: "commerce-platform",
  displayName: "acme/commerce-platform",
  defaultBranch: "main",
};

const proposal = IntentProposalSchema.parse({
  sourceIntent:
    "Checkout should never access the database directly. It must go through DatabaseGateway.",
  proposedTenet: {
    name: "Checkout Persistence Boundary",
    description:
      "Checkout should never access the database directly. It must go through DatabaseGateway.",
    type: "architecture",
    severity: "critical",
    enforcement: "block_merge",
    status: "draft",
    scope: ["checkout", "gateway", "database"],
    constraint: {
      kind: "forbid_direct_dependency",
      sourceModule: "checkout",
      targetModule: "database",
      expectedRoute: ["checkout", "gateway", "database"],
    },
  },
  rationale: "The requested persistence boundary maps to a direct dependency rule.",
  assumptions: ["Checkout, gateway, and database are configured architecture modules."],
  model: "gpt-5.6-terra",
  requiresHumanConfirmation: true,
});

const context = {
  params: Promise.resolve({ repositoryId: repository.slug }),
};

const createRequest = (body: unknown): NextRequest =>
  new NextRequest(
    `http://control-plane.test/api/repositories/${repository.slug}/tenet-proposals`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );

const createDependencies = (
  overrides: Partial<TenetProposalRouteDependencies> = {},
): TenetProposalRouteDependencies => ({
  isDatabaseConfigured: () => true,
  isAiConfigured: () => true,
  findRepository: async () => repository,
  propose: async () => proposal,
  ...overrides,
});

describe("POST /api/repositories/:repositoryId/tenet-proposals", () => {
  it("returns a draft proposal only and does not activate or persist it", async () => {
    const propose = vi.fn(async () => proposal);
    const handler = createPostTenetProposalHandler(createDependencies({ propose }));

    const response = await handler(
      createRequest({
        intent: proposal.sourceIntent,
        requestedScope: ["checkout", "gateway", "database"],
      }),
      context,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ proposal });
    expect(propose).toHaveBeenCalledWith({
      repository: {
        id: repository.slug,
        name: repository.name,
        defaultBranch: repository.defaultBranch,
      },
      intent: proposal.sourceIntent,
      requestedScope: ["checkout", "gateway", "database"],
    });
    expect(proposal.proposedTenet.status).toBe("draft");
  });

  it("rejects malformed request input before asking GPT for an interpretation", async () => {
    const propose = vi.fn(async () => proposal);
    const handler = createPostTenetProposalHandler(createDependencies({ propose }));

    const response = await handler(createRequest({ intent: "" }), context);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "invalid_tenet_proposal_request",
    });
    expect(propose).not.toHaveBeenCalled();
  });

  it("rejects malformed model output instead of returning a potentially active policy", async () => {
    const handler = createPostTenetProposalHandler(
      createDependencies({
        propose: async () =>
          ({ ...proposal, requiresHumanConfirmation: false }) as unknown as IntentProposal,
      }),
    );

    const response = await handler(createRequest({ intent: proposal.sourceIntent }), context);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: "ai_proposal_failed" });
  });

  it("reports unavailable AI without affecting persisted deterministic data", async () => {
    const propose = vi.fn(async () => proposal);
    const handler = createPostTenetProposalHandler(
      createDependencies({ isAiConfigured: () => false, propose }),
    );

    const response = await handler(createRequest({ intent: proposal.sourceIntent }), context);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "ai_unavailable" });
    expect(propose).not.toHaveBeenCalled();
  });
});
