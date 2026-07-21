import { NextResponse, type NextRequest } from "next/server";

import {
  TenetConfirmationRequestSchema,
  TenetConfirmationResponseSchema,
  type IntentProposal,
} from "@tenet/contracts";

import { getDatabase, isDatabaseConfigured } from "../../../../../../db/client";
import {
  createTenetActivationService,
  getManagedRepository,
  type ActivatedControlPlaneTenet,
  type ManagedRepository,
} from "../../../../../../lib/tenet-activation";

export const runtime = "nodejs";

interface RepositoryRouteContext {
  params: Promise<{ repositoryId: string }>;
}

export interface TenetConfirmationRouteDependencies {
  isDatabaseConfigured(): boolean;
  findRepository(slug: string): Promise<ManagedRepository | undefined>;
  confirm(
    repository: ManagedRepository,
    proposal: IntentProposal,
  ): Promise<ActivatedControlPlaneTenet>;
}

const defaultDependencies: TenetConfirmationRouteDependencies = {
  isDatabaseConfigured,
  findRepository: async (slug) => getManagedRepository(getDatabase(), slug),
  confirm: async (repository, proposal) =>
    createTenetActivationService(getDatabase()).confirm(repository, proposal),
};

export const createPostTenetConfirmationHandler = (
  dependencies: TenetConfirmationRouteDependencies = defaultDependencies,
) =>
  async (
    request: NextRequest,
    context: RepositoryRouteContext,
  ): Promise<NextResponse> => {
    if (!dependencies.isDatabaseConfigured()) {
      return NextResponse.json(
        { error: "control_plane_unavailable" },
        { status: 503 },
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "invalid_json" }, { status: 400 });
    }

    const parsedRequest = TenetConfirmationRequestSchema.safeParse(body);
    if (!parsedRequest.success) {
      return NextResponse.json(
        { error: "invalid_tenet_confirmation", issues: parsedRequest.error.issues },
        { status: 400 },
      );
    }

    const { repositoryId } = await context.params;
    const repository = await dependencies.findRepository(repositoryId);
    if (!repository) {
      return NextResponse.json({ error: "repository_not_found" }, { status: 404 });
    }

    try {
      const confirmation = await dependencies.confirm(
        repository,
        parsedRequest.data.proposal,
      );
      return NextResponse.json(
        TenetConfirmationResponseSchema.parse(confirmation),
        { status: confirmation.created ? 201 : 200 },
      );
    } catch {
      return NextResponse.json(
        { error: "tenet_confirmation_failed" },
        { status: 500 },
      );
    }
  };

export const POST = createPostTenetConfirmationHandler();
