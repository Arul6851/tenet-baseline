import { describe, expect, it, vi } from "vitest";

import {
  OpenAiTenetService,
  type OpenAiStructuredOutputClient,
} from "./tenet-ai-service.js";

const sourceIntent =
  "Checkout should never access the database directly. It must go through DatabaseGateway.";

const output = {
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
  rationale: "The requested boundary maps to a deterministic direct dependency rule.",
  assumptions: [],
};

describe("OpenAiTenetService", () => {
  it("normalizes a model draft and keeps server-owned safety metadata authoritative", async () => {
    const parse = vi.fn(async () => ({ output_parsed: output }));
    const client = {
      responses: { parse },
    } as unknown as OpenAiStructuredOutputClient;
    const service = new OpenAiTenetService("test-key", "gpt-5.6-terra", client);

    const proposal = await service.proposeTenet({
      repository: {
        id: "commerce-platform",
        name: "commerce-platform",
        defaultBranch: "main",
      },
      intent: sourceIntent,
    });

    expect(parse).toHaveBeenCalledOnce();
    expect(proposal).toMatchObject({
      sourceIntent,
      model: "gpt-5.6-terra",
      requiresHumanConfirmation: true,
      proposedTenet: { status: "draft" },
    });
  });

  it("rejects malformed parsed model output before it can become a proposal", async () => {
    const client = {
      responses: {
        parse: async () => ({ output_parsed: { proposedTenet: {} } }),
      },
    } as unknown as OpenAiStructuredOutputClient;
    const service = new OpenAiTenetService("test-key", "gpt-5.6-terra", client);

    await expect(
      service.proposeTenet({
        repository: {
          id: "commerce-platform",
          name: "commerce-platform",
          defaultBranch: "main",
        },
        intent: sourceIntent,
      }),
    ).rejects.toThrow();
  });
});
