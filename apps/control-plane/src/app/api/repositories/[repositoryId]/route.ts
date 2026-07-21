import { NextResponse } from "next/server";

import { getDatabase, isDatabaseConfigured } from "../../../../db/client";
import { getRepositorySummary } from "../../../../lib/repository-read-model";

export const runtime = "nodejs";

interface RepositoryRouteContext {
  params: Promise<{ repositoryId: string }>;
}

export async function GET(
  _request: Request,
  context: RepositoryRouteContext,
): Promise<NextResponse> {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "control_plane_unavailable" }, { status: 503 });
  }

  try {
    const { repositoryId } = await context.params;
    const summary = await getRepositorySummary(getDatabase(), repositoryId);

    return summary
      ? NextResponse.json(summary)
      : NextResponse.json({ error: "repository_not_found" }, { status: 404 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown persistence error";
    return NextResponse.json({ error: "read_failed", message }, { status: 500 });
  }
}
