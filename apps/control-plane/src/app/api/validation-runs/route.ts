import { NextResponse, type NextRequest } from "next/server";

import {
  ValidationRunIngestionSchema,
  ValidationRunIngestionResponseSchema,
  type ValidationRunIngestion,
} from "@tenet/contracts";

import { getDatabase, isDatabaseConfigured } from "../../../db/client";
import {
  createValidationRunPersistenceService,
  type ValidationRunPersistenceResult,
} from "../../../lib/validation-run-persistence";

export const runtime = "nodejs";

export interface ValidationRunRouteDependencies {
  isDatabaseConfigured(): boolean;
  ingest(input: ValidationRunIngestion): Promise<ValidationRunPersistenceResult>;
}

const defaultDependencies: ValidationRunRouteDependencies = {
  isDatabaseConfigured,
  ingest: async (input) =>
    createValidationRunPersistenceService(getDatabase()).ingest(input),
};

const unavailableResponse = (): NextResponse =>
  NextResponse.json(
    { error: "control_plane_unavailable" },
    { status: 503 },
  );

export const createPostValidationRunHandler = (
  dependencies: ValidationRunRouteDependencies = defaultDependencies,
) =>
  async (request: NextRequest): Promise<NextResponse> => {
    if (!dependencies.isDatabaseConfigured()) {
      return unavailableResponse();
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "invalid_json" },
        { status: 400 },
      );
    }

    const parsed = ValidationRunIngestionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "invalid_validation_run",
          issues: parsed.error.issues,
        },
        { status: 400 },
      );
    }

    try {
      const persisted = await dependencies.ingest(parsed.data);
      const response = ValidationRunIngestionResponseSchema.parse({
        validationRunId: persisted.validationRunId,
        created: !persisted.idempotent,
      });

      return NextResponse.json(response, {
        status: persisted.idempotent ? 200 : 201,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown persistence error";
      return NextResponse.json(
        { error: "validation_persistence_failed", message },
        { status: 500 },
      );
    }
  };

export const POST = createPostValidationRunHandler();
