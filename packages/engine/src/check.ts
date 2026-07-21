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
import { calculateArchitectureHealth } from "./health.js";
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

export const runArchitectureCheck = async (
  input: ArchitectureCheckInput,
): Promise<ArchitectureCheckResult> => {
  const repositoryRoot = resolve(input.repositoryRoot);
  const analysis = await analyzeTypeScriptRepository({
    repositoryRoot,
    tsconfigPath: resolve(repositoryRoot, input.configuration.tsconfig),
    modules: input.configuration.architecture.modules,
  });
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
