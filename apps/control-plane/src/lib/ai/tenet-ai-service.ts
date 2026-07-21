import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import {
  DeveloperExplanationSchema,
  IntentProposalSchema,
  type DeveloperExplanation,
  type DeveloperExplanationRequest,
  type IntentInterpreter,
  type IntentProposal,
  type NaturalLanguageTenetInput,
  type ViolationExplainer,
} from "@tenet/contracts";

class AiServiceUnavailableError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "AiServiceUnavailableError";
  }
}

export const defaultOpenAiModel = "gpt-5.6-terra";

export const getAiAvailability = (): {
  configured: boolean;
  model: string;
  mode: "proposal-and-explanation-only";
} => ({
  configured: Boolean(process.env.OPENAI_API_KEY),
  model: process.env.OPENAI_MODEL ?? defaultOpenAiModel,
  mode: "proposal-and-explanation-only",
});

const proposalInstructions = `
You are Tenet's intent interpreter. Convert a natural-language engineering intent
into a conservative structured Tenet proposal. Do not validate code, determine a
PASS/WARN/BLOCK result, activate a tenet, or claim enforcement. Return only a
proposal that requires explicit human confirmation. Preserve uncertainty in the
assumptions field and choose only constraints that can be deterministically
enforced by Tenet's current supported schemas.
`;

const explanationInstructions = `
You are Tenet's developer-facing explanation assistant. Explain only the supplied
deterministic violation evidence. Do not change, question, or override the
validator's result, do not invent source evidence, and do not produce an
independent blocking decision. Give concise next steps that respect the declared
tenet.
`;

export class OpenAiTenetService implements IntentInterpreter, ViolationExplainer {
  private readonly client: OpenAI;

  public constructor(
    apiKey: string,
    private readonly model = defaultOpenAiModel,
  ) {
    this.client = new OpenAI({ apiKey });
  }

  async proposeTenet(input: NaturalLanguageTenetInput): Promise<IntentProposal> {
    const response = await this.client.responses.parse({
      model: this.model,
      reasoning: { effort: "medium" },
      input: [
        { role: "system", content: proposalInstructions },
        { role: "user", content: JSON.stringify(input) },
      ],
      text: {
        format: zodTextFormat(IntentProposalSchema, "tenet_intent_proposal"),
      },
    });

    if (!response.output_parsed) {
      throw new Error("OpenAI returned no structured Tenet proposal.");
    }

    return IntentProposalSchema.parse(response.output_parsed);
  }

  async explainViolation(
    input: DeveloperExplanationRequest,
  ): Promise<DeveloperExplanation> {
    const response = await this.client.responses.parse({
      model: this.model,
      reasoning: { effort: "low" },
      input: [
        { role: "system", content: explanationInstructions },
        { role: "user", content: JSON.stringify(input) },
      ],
      text: {
        format: zodTextFormat(
          DeveloperExplanationSchema,
          "deterministic_violation_explanation",
        ),
      },
    });

    if (!response.output_parsed) {
      throw new Error("OpenAI returned no structured violation explanation.");
    }

    return DeveloperExplanationSchema.parse(response.output_parsed);
  }
}

export const createTenetAiService = (): OpenAiTenetService => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new AiServiceUnavailableError(
      "OPENAI_API_KEY is required to use GPT-5.6 intent interpretation.",
    );
  }

  return new OpenAiTenetService(
    apiKey,
    process.env.OPENAI_MODEL ?? defaultOpenAiModel,
  );
};
