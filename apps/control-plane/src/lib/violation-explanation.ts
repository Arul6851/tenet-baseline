import { and, eq } from "drizzle-orm";

import {
  DeveloperExplanationRequestSchema,
  TenetSchema,
  ViolationSchema,
  type DeveloperExplanation,
  type DeveloperExplanationRequest,
  type ViolationExplainer,
} from "@tenet/contracts";

import type { ControlPlaneDatabase } from "./tenet-activation";
import { repositories, tenets, violations } from "../db/schema";

const optionalDetail = (
  details: Record<string, unknown>,
  key: string,
): Record<string, unknown> =>
  details[key] === undefined ? {} : { [key]: details[key] };

/**
 * The record shape selected from PostgreSQL. Values remain unknown until the
 * shared deterministic contracts validate them immediately before an AI call.
 */
export interface PersistedViolationExplanationRecord {
  fingerprint: string;
  violationType: unknown;
  violationSeverity: unknown;
  violationEnforcement: unknown;
  violationStatus: unknown;
  title: string;
  message: string;
  affectedFiles: unknown;
  evidence: unknown;
  details: Record<string, unknown>;
  tenetExternalId: string;
  tenetName: string;
  tenetDescription: string;
  tenetType: unknown;
  tenetSeverity: unknown;
  tenetEnforcement: unknown;
  tenetStatus: unknown;
  tenetScope: unknown;
  tenetConstraint: unknown;
}

export const toDeveloperExplanationRequest = (
  record: PersistedViolationExplanationRecord,
): DeveloperExplanationRequest => {
  const details = record.details;
  const violation = ViolationSchema.parse({
    fingerprint: record.fingerprint,
    tenetId: record.tenetExternalId,
    tenetName: record.tenetName,
    tenetDescription: record.tenetDescription,
    type: record.violationType,
    severity: record.violationSeverity,
    enforcement: record.violationEnforcement,
    status: record.violationStatus,
    title: record.title,
    message: record.message,
    affectedFiles: record.affectedFiles,
    evidence: record.evidence,
    ...optionalDetail(details, "architectureFinding"),
    ...optionalDetail(details, "architecture"),
    ...optionalDetail(details, "semantic"),
  });
  const tenet = TenetSchema.parse({
    id: record.tenetExternalId,
    name: record.tenetName,
    description: record.tenetDescription,
    type: record.tenetType,
    severity: record.tenetSeverity,
    enforcement: record.tenetEnforcement,
    status: record.tenetStatus,
    scope: record.tenetScope,
    constraint: record.tenetConstraint,
  });

  return DeveloperExplanationRequestSchema.parse({ violation, tenet });
};

/**
 * Loads the original, persisted deterministic evidence. The client can select
 * a violation by fingerprint, but cannot provide evidence, a score, or a
 * validator result for the AI service to reinterpret.
 */
export const getDeveloperExplanationRequest = async (
  database: ControlPlaneDatabase,
  repositorySlug: string,
  fingerprint: string,
): Promise<DeveloperExplanationRequest | undefined> => {
  const [record] = await database
    .select({
      fingerprint: violations.fingerprint,
      violationType: violations.type,
      violationSeverity: violations.severity,
      violationEnforcement: violations.enforcement,
      violationStatus: violations.status,
      title: violations.title,
      message: violations.message,
      affectedFiles: violations.affectedFiles,
      evidence: violations.evidence,
      details: violations.details,
      tenetExternalId: tenets.externalId,
      tenetName: tenets.name,
      tenetDescription: tenets.description,
      tenetType: tenets.type,
      tenetSeverity: tenets.severity,
      tenetEnforcement: tenets.enforcement,
      tenetStatus: tenets.status,
      tenetScope: tenets.scope,
      tenetConstraint: tenets.constraint,
    })
    .from(violations)
    .innerJoin(repositories, eq(violations.repositoryId, repositories.id))
    .innerJoin(tenets, eq(violations.tenetId, tenets.id))
    .where(
      and(
        eq(repositories.slug, repositorySlug),
        eq(violations.fingerprint, fingerprint),
      ),
    )
    .limit(1);

  if (!record) {
    return undefined;
  }

  return toDeveloperExplanationRequest(record);
};

/**
 * GPT may phrase the supplied deterministic evidence for a developer, but it
 * cannot choose a different violation or affect the stored result.
 */
export const explainPersistedViolation = async (
  explainer: ViolationExplainer,
  request: DeveloperExplanationRequest,
): Promise<DeveloperExplanation> => {
  const explanation = await explainer.explainViolation(request);

  if (explanation.violationFingerprint !== request.violation.fingerprint) {
    throw new Error(
      "AI explanation did not acknowledge the requested deterministic violation.",
    );
  }

  return explanation;
};
