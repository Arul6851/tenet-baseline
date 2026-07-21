import { z } from "zod";

import {
  DeveloperExplanationSchema,
  IntentProposalSchema,
  type DeveloperExplanation,
  type IntentProposal,
} from "@tenet/contracts";

/**
 * The Responses API Structured Outputs subset requires every generated field
 * to be required. This schema is deliberately separate from the canonical
 * Tenet contract: nullable values represent optional domain fields only at the
 * model boundary and are normalized before deterministic code sees them.
 */
const OpenAiArchitectureConstraintSchema = z
  .object({
    // P0 only implements this architecture invariant in the deterministic
    // engine. Do not let the model draft canonical-but-unsupported policies.
    kind: z.literal("forbid_direct_dependency"),
    sourceModule: z.string(),
    targetModule: z.string(),
    /**
     * The canonical contract stores a complete route. Asking the model for the
     * intermediary alone prevents ambiguity between `gateway` and
     * `[checkout, gateway, database]`; the normalizer derives the route.
     */
    requiredIntermediary: z.string().nullable(),
  })
  .strict();

const openAiTenetMetadata = {
  name: z.string(),
  description: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  enforcement: z.enum(["report", "warn", "block_merge"]),
  status: z.literal("draft"),
  scope: z.array(z.string()),
} as const;

const OpenAiArchitectureTenetDraftSchema = z
  .object({
    ...openAiTenetMetadata,
    type: z.literal("architecture"),
    constraint: OpenAiArchitectureConstraintSchema,
  })
  .strict();

const OpenAiBusinessTenetDraftSchema = z
  .object({
    ...openAiTenetMetadata,
    type: z.literal("business"),
    constraint: z
      .object({
        kind: z.literal("max_combined_discount"),
        maximumPercent: z.number(),
        stackGroup: z.string(),
        requireCombinable: z.boolean(),
      })
      .strict(),
  })
  .strict();

/**
 * Only model-generated values belong here. The server supplies the original
 * intent, model identity, and confirmation requirement rather than trusting
 * the model to generate those safety-critical metadata fields.
 */
export const OpenAiIntentProposalOutputSchema = z
  .object({
    proposedTenet: z.discriminatedUnion("type", [
      OpenAiArchitectureTenetDraftSchema,
      OpenAiBusinessTenetDraftSchema,
    ]),
    rationale: z.string(),
    assumptions: z.array(z.string()),
  })
  .strict();
export type OpenAiIntentProposalOutput = z.infer<
  typeof OpenAiIntentProposalOutputSchema
>;

/**
 * This deliberately has no optional or defaulted fields. Canonical domain
 * validation below still enforces non-empty strings and non-empty lists.
 */
export const OpenAiDeveloperExplanationOutputSchema = z
  .object({
    violationFingerprint: z.string(),
    summary: z.string(),
    whyItMatters: z.string(),
    suggestedNextSteps: z.array(z.string()),
    evidenceAcknowledged: z.array(z.string()),
  })
  .strict();
export type OpenAiDeveloperExplanationOutput = z.infer<
  typeof OpenAiDeveloperExplanationOutputSchema
>;

const normalizeArchitectureConstraint = (
  constraint: Extract<
    OpenAiIntentProposalOutput["proposedTenet"],
    { type: "architecture" }
  >["constraint"],
) => ({
    kind: constraint.kind,
    sourceModule: constraint.sourceModule,
    targetModule: constraint.targetModule,
    ...(constraint.requiredIntermediary === null
      ? {}
      : {
          expectedRoute: [
            constraint.sourceModule,
            constraint.requiredIntermediary,
            constraint.targetModule,
          ],
        }),
  } as const);

/**
 * Converts required-but-nullable model output into the existing optional
 * deterministic contract, then validates the complete proposal strictly.
 */
export const normalizeOpenAiIntentProposal = (
  output: unknown,
  sourceIntent: string,
  model: string,
): IntentProposal => {
  const parsed = OpenAiIntentProposalOutputSchema.parse(output);
  const proposedTenet =
    parsed.proposedTenet.type === "architecture"
      ? {
          ...parsed.proposedTenet,
          constraint: normalizeArchitectureConstraint(
            parsed.proposedTenet.constraint,
          ),
        }
      : parsed.proposedTenet;

  return IntentProposalSchema.parse({
    sourceIntent,
    proposedTenet,
    rationale: parsed.rationale,
    assumptions: parsed.assumptions,
    model,
    requiresHumanConfirmation: true,
  });
};

/** Strictly validates generated explanation text before the UI can render it. */
export const normalizeOpenAiDeveloperExplanation = (
  output: unknown,
): DeveloperExplanation =>
  DeveloperExplanationSchema.parse(
    OpenAiDeveloperExplanationOutputSchema.parse(output),
  );
