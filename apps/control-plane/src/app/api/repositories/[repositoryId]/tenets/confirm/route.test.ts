import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

import {
  IntentProposalSchema,
  TenetSchema,
} from "@tenet/contracts";

import type { ManagedRepository } from "../../../../../../lib/tenet-activation";
import {
  createPostTenetConfirmationHandler,
  type TenetConfirmationRouteDependencies,
} from "./route.js";

const repository: ManagedRepository = {
  databaseId: "9c2b1d1a-39ed-4bd4-bf0c-f512c66ea187",
  slug: "commerce-platform",
  name: "commerce-platform",
  displayName: "acme/commerce-platform",
  defaultBranch: "main",
};

const proposal = IntentProposalSchema.parse({
  sourceIntent: "Checkout must persist through DatabaseGateway.",
  proposedTenet: {
    name: "Checkout Persistence Boundary",
    description: "Checkout must persist through DatabaseGateway.",
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
  rationale: "This is a supported direct-dependency boundary.",
  assumptions: [],
  model: "gpt-5.6-terra",
  requiresHumanConfirmation: true,
});

const activeTenet = TenetSchema.parse({
  ...proposal.proposedTenet,
  id: "control-plane-4f4232c447b6c12172ccf58a",
  status: "active",
});

const context = {
  params: Promise.resolve({ repositoryId: repository.slug }),
};

const createRequest = (body: unknown): NextRequest =>
  new NextRequest(
    `http://control-plane.test/api/repositories/${repository.slug}/tenets/confirm`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );

const createDependencies = (
  overrides: Partial<TenetConfirmationRouteDependencies> = {},
): TenetConfirmationRouteDependencies => ({
  isDatabaseConfigured: () => true,
  findRepository: async () => repository,
  confirm: async () => ({
    tenet: activeTenet,
    created: true,
    localRepositorySyncRequired: true,
  }),
  ...overrides,
});

describe("POST /api/repositories/:repositoryId/tenets/confirm", () => {
  it("persists an active control-plane Tenet only after explicit confirmation", async () => {
    const confirm = vi.fn(async () => ({
      tenet: activeTenet,
      created: true,
      localRepositorySyncRequired: true as const,
    }));
    const handler = createPostTenetConfirmationHandler(
      createDependencies({ confirm }),
    );

    const response = await handler(
      createRequest({ proposal, confirmed: true }),
      context,
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      tenet: activeTenet,
      created: true,
      localRepositorySyncRequired: true,
    });
    expect(confirm).toHaveBeenCalledWith(repository, proposal);
    expect(proposal.proposedTenet.status).toBe("draft");
  });

  it("rejects an unconfirmed or malformed proposal before persistence", async () => {
    const confirm = vi.fn(async () => ({
      tenet: activeTenet,
      created: true,
      localRepositorySyncRequired: true as const,
    }));
    const handler = createPostTenetConfirmationHandler(
      createDependencies({ confirm }),
    );

    const unconfirmed = await handler(
      createRequest({ proposal, confirmed: false }),
      context,
    );
    const modelBypass = await handler(
      createRequest({
        proposal: { ...proposal, requiresHumanConfirmation: false },
        confirmed: true,
      }),
      context,
    );
    const directActivation = await handler(
      createRequest({ tenet: activeTenet, confirmed: true }),
      context,
    );

    expect(unconfirmed.status).toBe(400);
    expect(modelBypass.status).toBe(400);
    expect(directActivation.status).toBe(400);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("does not report local CLI enforcement as part of confirmation", async () => {
    const handler = createPostTenetConfirmationHandler(createDependencies());

    const response = await handler(
      createRequest({ proposal, confirmed: true }),
      context,
    );

    await expect(response.json()).resolves.toMatchObject({
      tenet: { status: "active" },
      localRepositorySyncRequired: true,
    });
  });
});
