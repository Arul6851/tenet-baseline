import { NextResponse } from "next/server";

import {
  ViolationExplanationResponseSchema,
  type DeveloperExplanation,
  type DeveloperExplanationRequest,
} from "@tenet/contracts";

import { getDatabase, isDatabaseConfigured } from "../../../../../../../db/client";
import {
  createTenetAiService,
  getAiAvailability,
} from "../../../../../../../lib/ai/tenet-ai-service";
import {
  explainPersistedViolation,
  getDeveloperExplanationRequest,
} from "../../../../../../../lib/violation-explanation";

export const runtime = "nodejs";

interface ViolationExplanationRouteContext {
  params: Promise<{ repositoryId: string; fingerprint: string }>;
}

export interface ViolationExplanationRouteDependencies {
  isDatabaseConfigured(): boolean;
  isAiConfigured(): boolean;
  findExplanationRequest(
    repositorySlug: string,
    fingerprint: string,
  ): Promise<DeveloperExplanationRequest | undefined>;
  explain(input: DeveloperExplanationRequest): Promise<DeveloperExplanation>;
}

const defaultDependencies: ViolationExplanationRouteDependencies = {
  isDatabaseConfigured,
  isAiConfigured: () => getAiAvailability().configured,
  findExplanationRequest: async (repositorySlug, fingerprint) =>
    getDeveloperExplanationRequest(getDatabase(), repositorySlug, fingerprint),
  explain: async (input) =>
    explainPersistedViolation(createTenetAiService(), input),
};

export const createPostViolationExplanationHandler = (
  dependencies: ViolationExplanationRouteDependencies = defaultDependencies,
) =>
  async (
    _request: Request,
    context: ViolationExplanationRouteContext,
  ): Promise<NextResponse> => {
    if (!dependencies.isDatabaseConfigured()) {
      return NextResponse.json(
        { error: "control_plane_unavailable" },
        { status: 503 },
      );
    }

    const { repositoryId, fingerprint } = await context.params;
    if (fingerprint.length === 0) {
      return NextResponse.json(
        { error: "invalid_violation_fingerprint" },
        { status: 400 },
      );
    }

    let explanationRequest: DeveloperExplanationRequest | undefined;
    try {
      explanationRequest = await dependencies.findExplanationRequest(
        repositoryId,
        fingerprint,
      );
    } catch {
      return NextResponse.json(
        { error: "deterministic_evidence_unavailable" },
        { status: 500 },
      );
    }

    if (!explanationRequest) {
      return NextResponse.json({ error: "violation_not_found" }, { status: 404 });
    }

    if (!dependencies.isAiConfigured()) {
      return NextResponse.json({ error: "ai_unavailable" }, { status: 503 });
    }

    try {
      const explanation = await dependencies.explain(explanationRequest);
      return NextResponse.json(
        ViolationExplanationResponseSchema.parse({ explanation }),
        { status: 200 },
      );
    } catch {
      return NextResponse.json(
        { error: "ai_explanation_failed" },
        { status: 502 },
      );
    }
  };

export const POST = createPostViolationExplanationHandler();
