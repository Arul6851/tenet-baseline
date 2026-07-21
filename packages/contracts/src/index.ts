import { z } from "zod";

export const SeveritySchema = z.enum(["low", "medium", "high", "critical"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const EnforcementSchema = z.enum(["report", "warn", "block_merge"]);
export type Enforcement = z.infer<typeof EnforcementSchema>;

export const TenetTypeSchema = z.enum(["architecture", "business"]);
export type TenetType = z.infer<typeof TenetTypeSchema>;

export const TenetStatusSchema = z.enum(["draft", "active", "disabled"]);
export type TenetStatus = z.infer<typeof TenetStatusSchema>;

export const ValidationStatusSchema = z.enum(["PASS", "WARN", "BLOCK"]);
export type ValidationStatus = z.infer<typeof ValidationStatusSchema>;

export const ViolationStatusSchema = z.enum(["active", "resolved", "blocked"]);
export type ViolationStatus = z.infer<typeof ViolationStatusSchema>;

export const ComplianceStatusSchema = z.enum([
  "satisfied",
  "at_risk",
  "violated",
]);
export type ComplianceStatus = z.infer<typeof ComplianceStatusSchema>;

export const ArchitectureFindingKindSchema = z.enum([
  "boundary_violation",
  "circular_dependency",
  "unauthorized_cross_layer",
  "architectural_drift",
]);
export type ArchitectureFindingKind = z.infer<
  typeof ArchitectureFindingKindSchema
>;

export const RepositoryReferenceSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    defaultBranch: z.string().min(1).default("main"),
  })
  .strict();
export type RepositoryReference = z.infer<typeof RepositoryReferenceSchema>;

export const ArchitectureNodeSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1).optional(),
    paths: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type ArchitectureNode = z.infer<typeof ArchitectureNodeSchema>;

export const ArchitectureEdgeSchema = z
  .object({
    sourceModule: z.string().min(1),
    targetModule: z.string().min(1),
  })
  .strict();
export type ArchitectureEdge = z.infer<typeof ArchitectureEdgeSchema>;

const ArchitectureEdgeTupleSchema = z.tuple([
  z.string().min(1),
  z.string().min(1),
]);

export const ArchitectureConstraintSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("forbid_direct_dependency"),
      sourceModule: z.string().min(1),
      targetModule: z.string().min(1),
      expectedRoute: z.array(z.string().min(1)).min(2).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("allow_only_dependencies"),
      sourceModule: z.string().min(1),
      allowedTargetModules: z.array(z.string().min(1)),
    })
    .strict(),
]);
export type ArchitectureConstraint = z.infer<typeof ArchitectureConstraintSchema>;

export const MaxCombinedDiscountConstraintSchema = z
  .object({
    kind: z.literal("max_combined_discount"),
    maximumPercent: z.number().min(0).max(100),
    stackGroup: z.string().min(1),
    requireCombinable: z.boolean().default(true),
  })
  .strict();
export type MaxCombinedDiscountConstraint = z.infer<
  typeof MaxCombinedDiscountConstraintSchema
>;

export const TenetConstraintSchema = z.union([
  ArchitectureConstraintSchema,
  MaxCombinedDiscountConstraintSchema,
]);
export type TenetConstraint = z.infer<typeof TenetConstraintSchema>;

export const TenetSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    description: z.string().min(1),
    type: TenetTypeSchema,
    severity: SeveritySchema,
    enforcement: EnforcementSchema,
    status: TenetStatusSchema,
    scope: z.array(z.string().min(1)).min(1),
    constraint: TenetConstraintSchema,
  })
  .strict();
export type Tenet = z.infer<typeof TenetSchema>;

export const ArchitectureConfigurationSchema = z
  .object({
    modules: z.array(ArchitectureNodeSchema).min(1),
    intendedEdges: z.array(ArchitectureEdgeTupleSchema).default([]),
    allowedEdges: z.array(ArchitectureEdgeSchema).default([]),
  })
  .strict();
export type ArchitectureConfiguration = z.infer<
  typeof ArchitectureConfigurationSchema
>;

export const TenetConfigurationSchema = z
  .object({
    version: z.literal(1),
    repository: z
      .object({
        id: z.string().min(1).optional(),
        name: z.string().min(1),
      })
      .strict(),
    tsconfig: z.string().min(1).default("tsconfig.json"),
    architecture: ArchitectureConfigurationSchema,
    tenets: z.array(TenetSchema).default([]),
  })
  .strict();
export type TenetConfiguration = z.infer<typeof TenetConfigurationSchema>;

export const TenetDraftSchema = TenetSchema.omit({ id: true }).extend({
  status: z.literal("draft"),
});
export type TenetDraft = z.infer<typeof TenetDraftSchema>;

export const DependencyEdgeSchema = z
  .object({
    sourceModule: z.string().min(1),
    targetModule: z.string().min(1),
    sourceFile: z.string().min(1),
    targetFile: z.string().min(1),
    importSpecifier: z.string().min(1),
    importKind: z.enum(["runtime", "type", "dynamic"]),
    line: z.number().int().positive().optional(),
    column: z.number().int().positive().optional(),
  })
  .strict();
export type DependencyEdge = z.infer<typeof DependencyEdgeSchema>;

export const ViolationEvidenceSchema = z
  .object({
    kind: z.enum(["import", "symbol", "constant", "graph"]),
    file: z.string().min(1),
    line: z.number().int().positive().optional(),
    column: z.number().int().positive().optional(),
    excerpt: z.string().min(1),
  })
  .strict();
export type ViolationEvidence = z.infer<typeof ViolationEvidenceSchema>;

export const ArchitectureViolationDetailsSchema = z
  .object({
    sourceModule: z.string().min(1),
    targetModule: z.string().min(1),
    expectedRoute: z.array(z.string().min(1)).min(2),
    actualDependency: ArchitectureEdgeSchema,
  })
  .strict();
export type ArchitectureViolationDetails = z.infer<
  typeof ArchitectureViolationDetailsSchema
>;

export const ViolationSchema = z
  .object({
    fingerprint: z.string().min(1),
    tenetId: z.string().min(1),
    tenetName: z.string().min(1).optional(),
    tenetDescription: z.string().min(1).optional(),
    type: z.enum(["architecture", "semantic", "intent"]),
    severity: SeveritySchema,
    enforcement: EnforcementSchema,
    status: ViolationStatusSchema,
    title: z.string().min(1),
    message: z.string().min(1),
    affectedFiles: z.array(z.string().min(1)).min(1),
    evidence: z.array(ViolationEvidenceSchema).min(1),
    architectureFinding: ArchitectureFindingKindSchema.optional(),
    architecture: ArchitectureViolationDetailsSchema.optional(),
  })
  .strict();
export type Violation = z.infer<typeof ViolationSchema>;

export const TenetEvaluationSchema = z
  .object({
    tenetId: z.string().min(1),
    status: ComplianceStatusSchema,
    summary: z.string().min(1),
    violationFingerprints: z.array(z.string().min(1)),
  })
  .strict();
export type TenetEvaluation = z.infer<typeof TenetEvaluationSchema>;

export const HealthDeductionSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().min(1),
    amount: z.number().int().positive(),
    reason: z.string().min(1),
  })
  .strict();
export type HealthDeduction = z.infer<typeof HealthDeductionSchema>;

export const HealthScoreSchema = z
  .object({
    score: z.number().int().min(0).max(100),
    deductions: z.array(HealthDeductionSchema),
  })
  .strict();
export type HealthScore = z.infer<typeof HealthScoreSchema>;

export const GitMetadataSchema = z
  .object({
    baseSha: z.string().min(1).optional(),
    headSha: z.string().min(1),
    branch: z.string().min(1),
    author: z.string().min(1).optional(),
    commitMessage: z.string().min(1).optional(),
  })
  .strict();
export type GitMetadata = z.infer<typeof GitMetadataSchema>;

export const ValidationResultSchema = z
  .object({
    analysisVersion: z.string().min(1),
    status: ValidationStatusSchema,
    repository: RepositoryReferenceSchema,
    git: GitMetadataSchema,
    changedFiles: z.array(z.string().min(1)),
    graph: z
      .object({
        nodes: z.array(ArchitectureNodeSchema),
        edges: z.array(DependencyEdgeSchema),
      })
      .strict(),
    violations: z.array(ViolationSchema),
    tenetEvaluations: z.array(TenetEvaluationSchema),
    health: z
      .object({
        architecture: HealthScoreSchema,
        intent: HealthScoreSchema,
      })
      .strict(),
    createdAt: z.string().datetime(),
  })
  .strict();
export type ValidationResult = z.infer<typeof ValidationResultSchema>;

export const NaturalLanguageTenetInputSchema = z
  .object({
    repository: RepositoryReferenceSchema,
    intent: z.string().min(1),
    requestedScope: z.array(z.string().min(1)).optional(),
  })
  .strict();
export type NaturalLanguageTenetInput = z.infer<
  typeof NaturalLanguageTenetInputSchema
>;

export const IntentProposalSchema = z
  .object({
    sourceIntent: z.string().min(1),
    proposedTenet: TenetDraftSchema,
    rationale: z.string().min(1),
    assumptions: z.array(z.string()),
    model: z.string().min(1),
    requiresHumanConfirmation: z.literal(true),
  })
  .strict();
export type IntentProposal = z.infer<typeof IntentProposalSchema>;

export const DeveloperExplanationRequestSchema = z
  .object({
    violation: ViolationSchema,
    tenet: TenetSchema,
  })
  .strict();
export type DeveloperExplanationRequest = z.infer<
  typeof DeveloperExplanationRequestSchema
>;

export const DeveloperExplanationSchema = z
  .object({
    violationFingerprint: z.string().min(1),
    summary: z.string().min(1),
    whyItMatters: z.string().min(1),
    suggestedNextSteps: z.array(z.string().min(1)).min(1),
    evidenceAcknowledged: z.array(z.string().min(1)).min(1),
  })
  .strict();
export type DeveloperExplanation = z.infer<typeof DeveloperExplanationSchema>;

/**
 * AI services may interpret intent or explain evidence, but these interfaces
 * intentionally have no method for changing deterministic validation results.
 */
export interface IntentInterpreter {
  proposeTenet(input: NaturalLanguageTenetInput): Promise<IntentProposal>;
}

export interface ViolationExplainer {
  explainViolation(
    input: DeveloperExplanationRequest,
  ): Promise<DeveloperExplanation>;
}
