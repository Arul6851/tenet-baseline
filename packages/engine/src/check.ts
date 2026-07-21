import { resolve } from "node:path";

import type {
  HealthScore,
  TenetConfiguration,
  TenetEvaluation,
  ValidationStatus,
  Violation,
} from "@tenet/contracts";

import {
  analyzeTypeScriptRepository,
  type RepositoryAnalysis,
} from "./analysis.js";
import { validateArchitectureTenets } from "./architecture.js";
import { validateBusinessTenets } from "./business.js";
import { calculateArchitectureHealth, calculateIntentHealth } from "./health.js";
import { deriveValidationStatus } from "./validation.js";

export interface ArchitectureCheckInput {
  repositoryRoot: string;
  configuration: TenetConfiguration;
}

export interface ArchitectureCheckResult {
  analysis: RepositoryAnalysis;
  violations: readonly Violation[];
  evaluations: readonly TenetEvaluation[];
  architectureHealth: HealthScore;
  status: ValidationStatus;
}

export interface TenetCheckResult extends ArchitectureCheckResult {
  architectureEvaluations: readonly TenetEvaluation[];
  businessEvaluations: readonly TenetEvaluation[];
  intentHealth: HealthScore;
}

const analyzeRepository = async (
  input: ArchitectureCheckInput,
): Promise<RepositoryAnalysis> => {
  const repositoryRoot = resolve(input.repositoryRoot);
  return analyzeTypeScriptRepository({
    repositoryRoot,
    tsconfigPath: resolve(repositoryRoot, input.configuration.tsconfig),
    modules: input.configuration.architecture.modules,
  });
};

export const runArchitectureCheck = async (
  input: ArchitectureCheckInput,
): Promise<ArchitectureCheckResult> => {
  const analysis = await analyzeRepository(input);
  const validation = validateArchitectureTenets({
    analysis,
    tenets: input.configuration.tenets,
  });
  const architectureHealth = calculateArchitectureHealth(validation.findings);

  return {
    analysis,
    violations: validation.violations,
    evaluations: validation.evaluations,
    architectureHealth,
    status: deriveValidationStatus(validation.violations),
  };
};

/**
 * Evaluates architecture and business Tenets from one deterministic source
 * analysis. Architecture Health only receives architecture findings; Intent
 * Health only receives business-Tenet compliance, so the two scores stay
 * explainable and independent.
 */
export const runTenetCheck = async (
  input: ArchitectureCheckInput,
): Promise<TenetCheckResult> => {
  const analysis = await analyzeRepository(input);
  const architectureValidation = validateArchitectureTenets({
    analysis,
    tenets: input.configuration.tenets,
  });
  const businessValidation = validateBusinessTenets({
    analysis,
    tenets: input.configuration.tenets,
  });
  const violations = [
    ...architectureValidation.violations,
    ...businessValidation.violations,
  ].sort((left, right) => left.fingerprint.localeCompare(right.fingerprint));
  const architectureEvaluations = architectureValidation.evaluations;
  const businessEvaluations = businessValidation.evaluations;

  return {
    analysis,
    violations,
    evaluations: [...architectureEvaluations, ...businessEvaluations],
    architectureEvaluations,
    businessEvaluations,
    architectureHealth: calculateArchitectureHealth(architectureValidation.findings),
    intentHealth: calculateIntentHealth(businessEvaluations),
    status: deriveValidationStatus(violations),
  };
};
