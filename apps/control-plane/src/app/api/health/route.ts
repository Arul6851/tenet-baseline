import { NextResponse } from "next/server";

import { isDatabaseConfigured } from "../../../db/client";
import { getAiAvailability } from "../../../lib/ai/tenet-ai-service";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    service: "tenet-control-plane",
    status: "ok",
    databaseConfigured: isDatabaseConfigured(),
    ai: getAiAvailability(),
  });
}
