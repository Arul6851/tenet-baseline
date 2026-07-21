import { NextResponse, type NextRequest } from "next/server";

import {
  CreateTenetProposalRequestSchema,
  NaturalLanguageTenetInputSchema,
  TenetProposalResponseSchema,
  type IntentProposal,
  type NaturalLanguageTenetInput,
} from "@tenet/contracts";

import { getDatabase, isDatabaseConfigured } from "../../../../../db/client";
import {
  createTenetAiService,
  getAiAvailability,
} from "../../../../../lib/ai/tenet-ai-service";
import {
  getManagedRepository,
  toRepositoryReference,
  type ManagedRepository,
} from "../../../../../lib/tenet-activation";

export const runtime = "nodejs";

interface RepositoryRouteContext {
  params: Promise<{ repositoryId: string }>;
}

export interface TenetProposalRouteDependencies {
  isDatabaseConfigured(): boolean;
  isAiConfigured(): boolean;
  findRepository(slug: string): Promise<ManagedRepository | undefined>;
  propose(input: NaturalLanguageTenetInput): Promise<IntentProposal>;
}

const defaultDependencies: TenetProposalRouteDependencies = {
  isDatabaseConfigured,
  isAiConfigured: () => getAiAvailability().configured,
  findRepository: async (slug) => getManagedRepository(getDatabase(), slug),
  propose: async (input) => createTenetAiService().proposeTenet(input),
};

const unavailableResponse = (): NextResponse =>
  NextResponse.json({ error: "control_plane_unavailable" }, { status: 503 });

export const createPostTenetProposalHandler = (
  dependencies: TenetProposalRouteDependencies = defaultDependencies,
) =>
  async (
    request: NextRequest,
    context: RepositoryRouteContext,
  ): Promise<NextResponse> => {
    if (!dependencies.isDatabaseConfigured()) {
      return unavailableResponse();
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const parsedRequest = CreateTenetProposalRequestSchema.safeParse(body);
    if (!parsedRequest.success) {
      return NextResponse.json(
        { error: "invalid_tenet_proposal_request", issues: parsedRequest.error.issues },
        { status: 400 },
      );
    }

    const { repositoryId } = await context.params;
    const repository = await dependencies.findRepository(repositoryId);
    if (!repository) {
      return NextResponse.json({ error: "repository_not_found" }, { status: 404 });
    }

    if (!dependencies.isAiConfigured()) {
      return NextResponse.json(
        { error: "ai_unavailable" },
        { status: 503 },
      );
    }

    const input = NaturalLanguageTenetInputSchema.parse({
      repository: toRepositoryReference(repository),
      intent: parsedRequest.data.intent,
      ...(parsedRequest.data.requestedScope === undefined
        ? {}
        : { requestedScope: parsedRequest.data.requestedScope }),
    });

    try {
      const proposal = await dependencies.propose(input);
      return NextResponse.json(
        TenetProposalResponseSchema.parse({ proposal }),
        { status: 200 },
      );
    } catch {
      return NextResponse.json({ error: "ai_proposal_failed" }, { status: 502 });
    }
  };

export const POST = createPostTenetProposalHandler();
