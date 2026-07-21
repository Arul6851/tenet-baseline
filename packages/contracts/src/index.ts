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
        displayName: z.string().min(1).optional(),
      })
      .strict(),
    tsconfig: z.string().min(1).default("tsconfig.json"),
    architecture: ArchitectureConfigurationSchema,
    tenets: z.array(TenetSchema).default([]),
  })
  .strict();
export type TenetConfiguration = z.infer<typeof TenetConfigurationSchema>;

export const AnalysisWarningSchema = z
  .object({
    kind: z.enum([
      "dynamic_import",
      "unresolved_import",
      "unsupported_discount_declaration",
      "duplicate_discount_declaration",
    ]),
    file: z.string().min(1),
    line: z.number().int().positive(),
    column: z.number().int().positive(),
    importSpecifier: z.string().min(1),
    message: z.string().min(1),
  })
  .strict();
export type AnalysisWarning = z.infer<typeof AnalysisWarningSchema>;

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
    kind: z.enum(["import", "symbol", "constant", "discount", "graph"]),
    file: z.string().min(1),
    line: z.number().int().positive().optional(),
    column: z.number().int().positive().optional(),
    excerpt: z.string().min(1),
  })
  .strict();
export type ViolationEvidence = z.infer<typeof ViolationEvidenceSchema>;

/**
 * A discount declaration that was extracted entirely from literal TypeScript
 * source. Facts with computed or otherwise uncertain fields are deliberately
 * excluded from this model so they cannot become blocking evidence.
 */
export const DiscountFactSchema = z
  .object({
    kind: z.literal("discount"),
    id: z.string().min(1),
    name: z.string().min(1).optional(),
    percent: z.number().min(0).max(100),
    stackGroup: z.string().min(1),
    combinable: z.boolean(),
    sourceModule: z.string().min(1).optional(),
    sourceFile: z.string().min(1),
    line: z.number().int().positive(),
    column: z.number().int().positive(),
    excerpt: z.string().min(1),
  })
  .strict();
export type DiscountFact = z.infer<typeof DiscountFactSchema>;

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

export const SemanticViolationDetailsSchema = z
  .object({
    kind: z.literal("max_combined_discount"),
    stackGroup: z.string().min(1),
    maximumPercent: z.number().min(0).max(100),
    potentialPercent: z.number().min(0),
    contributingDiscounts: z.array(DiscountFactSchema).min(1),
  })
  .strict();
export type SemanticViolationDetails = z.infer<
  typeof SemanticViolationDetailsSchema
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
    semantic: SemanticViolationDetailsSchema.optional(),
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

export const ControlPlaneRepositorySchema = z
  .object({
    slug: z.string().min(1).max(160),
    name: z.string().min(1).max(160),
    displayName: z.string().min(1).max(240),
    defaultBranch: z.string().min(1).default("main"),
  })
  .strict();
export type ControlPlaneRepository = z.infer<typeof ControlPlaneRepositorySchema>;

export const ValidationRunSourceSchema = z.enum(["cli", "ci", "manual"]);
export type ValidationRunSource = z.infer<typeof ValidationRunSourceSchema>;

export const ValidationGitContextSchema = z
  .object({
    baseSha: z.string().min(1).optional(),
    headSha: z.string().min(1).optional(),
    branch: z.string().min(1).optional(),
    author: z.string().min(1).optional(),
    message: z.string().min(1).optional(),
  })
  .strict();
export type ValidationGitContext = z.infer<typeof ValidationGitContextSchema>;

export const ValidationGraphSnapshotSchema = z
  .object({
    nodes: z.array(ArchitectureNodeSchema),
    edges: z.array(DependencyEdgeSchema),
  })
  .strict();
export type ValidationGraphSnapshot = z.infer<
  typeof ValidationGraphSnapshotSchema
>;

/**
 * The validated payload accepted by the control plane after local deterministic
 * enforcement has already completed. It carries evidence, not an instruction
 * for the control plane to recalculate PASS/WARN/BLOCK.
 */
export const ValidationRunIngestionSchema = z
  .object({
    version: z.literal(1),
    idempotencyKey: z.string().uuid(),
    repository: ControlPlaneRepositorySchema,
    source: ValidationRunSourceSchema,
    completedAt: z.string().datetime(),
    status: ValidationStatusSchema,
    git: ValidationGitContextSchema,
    analyzerVersion: z.string().min(1),
    changedFiles: z.array(z.string().min(1)),
    warnings: z.array(AnalysisWarningSchema),
    architecture: ArchitectureConfigurationSchema,
    graph: ValidationGraphSnapshotSchema,
    tenets: z.array(TenetSchema),
    tenetEvaluations: z.array(TenetEvaluationSchema),
    violations: z.array(ViolationSchema),
    health: z
      .object({
        architecture: HealthScoreSchema,
        intent: HealthScoreSchema,
      })
      .strict(),
  })
  .strict()
  .superRefine((payload, context) => {
    const tenetIds = new Set<string>();
    for (const [index, tenet] of payload.tenets.entries()) {
      if (tenetIds.has(tenet.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tenets", index, "id"],
          message: `Tenet id "${tenet.id}" is duplicated in this validation run.`,
        });
        continue;
      }

      tenetIds.add(tenet.id);
    }

    const moduleIds = new Set(
      payload.architecture.modules.map((module) => module.id),
    );
    for (const [index, edge] of payload.graph.edges.entries()) {
      for (const [field, moduleId] of [
        ["sourceModule", edge.sourceModule],
        ["targetModule", edge.targetModule],
      ] as const) {
        if (!moduleIds.has(moduleId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["graph", "edges", index, field],
            message: `Graph edge ${field} "${moduleId}" is not a configured architecture module.`,
          });
        }
      }
    }

    const violationFingerprints = new Set<string>();
    for (const [index, violation] of payload.violations.entries()) {
      if (!tenetIds.has(violation.tenetId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["violations", index, "tenetId"],
          message: `Violation references unknown Tenet "${violation.tenetId}".`,
        });
      }

      if (violation.status === "resolved") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["violations", index, "status"],
          message: "Completed validation runs may only report currently observed violations.",
        });
      }

      if (violationFingerprints.has(violation.fingerprint)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["violations", index, "fingerprint"],
          message: `Violation fingerprint "${violation.fingerprint}" is duplicated in this validation run.`,
        });
        continue;
      }

      violationFingerprints.add(violation.fingerprint);
    }

    const evaluatedTenets = new Set<string>();
    for (const [index, evaluation] of payload.tenetEvaluations.entries()) {
      if (!tenetIds.has(evaluation.tenetId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tenetEvaluations", index, "tenetId"],
          message: `Tenet evaluation references unknown Tenet "${evaluation.tenetId}".`,
        });
      }

      if (evaluatedTenets.has(evaluation.tenetId)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tenetEvaluations", index, "tenetId"],
          message: `Tenet "${evaluation.tenetId}" has more than one evaluation in this validation run.`,
        });
      }
      evaluatedTenets.add(evaluation.tenetId);

      for (const fingerprint of evaluation.violationFingerprints) {
        if (!violationFingerprints.has(fingerprint)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["tenetEvaluations", index, "violationFingerprints"],
            message: `Tenet evaluation references unknown violation fingerprint "${fingerprint}".`,
          });
        }
      }
    }

    for (const [index, violation] of payload.violations.entries()) {
      const isReferencedByEvaluation = payload.tenetEvaluations.some(
        (evaluation) =>
          evaluation.tenetId === violation.tenetId &&
          evaluation.violationFingerprints.includes(violation.fingerprint),
      );
      if (!isReferencedByEvaluation) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["violations", index, "fingerprint"],
          message: `Violation fingerprint "${violation.fingerprint}" is not referenced by its Tenet evaluation.`,
        });
      }
    }
  });
export type ValidationRunIngestion = z.infer<
  typeof ValidationRunIngestionSchema
>;

export const ValidationRunIngestionResponseSchema = z
  .object({
    validationRunId: z.string().uuid(),
    created: z.boolean(),
  })
  .strict();
export type ValidationRunIngestionResponse = z.infer<
  typeof ValidationRunIngestionResponseSchema
>;

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
