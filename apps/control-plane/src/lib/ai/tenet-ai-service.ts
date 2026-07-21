import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import {
  type DeveloperExplanation,
  type DeveloperExplanationRequest,
  type IntentInterpreter,
  type IntentProposal,
  type NaturalLanguageTenetInput,
  type ViolationExplainer,
} from "@tenet/contracts";

import {
  normalizeOpenAiDeveloperExplanation,
  normalizeOpenAiIntentProposal,
  OpenAiDeveloperExplanationOutputSchema,
  OpenAiIntentProposalOutputSchema,
} from "./openai-output-schema";

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
into one conservative structured Tenet proposal. Do not validate code, determine
a PASS/WARN/BLOCK result, activate a Tenet, or claim enforcement. The system,
not you, attaches the original intent, model identity, and required human
confirmation metadata.

Choose only constraints that Tenet can deterministically enforce. For a direct
dependency boundary, use forbid_direct_dependency with lowercase module IDs and
a requiredIntermediary when the user's intent explicitly names an intermediary;
otherwise set requiredIntermediary to null. Do not construct a full route: the
system derives it from source, intermediary, and target. For a combined-discount
cap, use max_combined_discount with the stated percentage, the relevant stack
group, and whether discounts must be combinable. Record any uncertainty or scope
inference in assumptions so a human can reject the draft.

For Tenet's current P0 policy vocabulary, use these identifiers exactly rather
than friendly aliases: checkout, gateway, database, and customer. In particular,
DatabaseGateway maps to gateway, and a customer-discount cap uses stackGroup
customer (not customer-discounts). If an intent does not fit this supported
vocabulary, state that limitation in assumptions rather than inventing a new
deterministic policy identifier.
`;

const explanationInstructions = `
You are Tenet's developer-facing explanation assistant. Explain only the supplied
deterministic violation evidence. Do not change, question, or override the
validator's result, do not invent source evidence, and do not produce an
independent blocking decision. Give concise next steps that respect the declared
tenet.
`;

export type OpenAiStructuredOutputClient = Pick<OpenAI, "responses">;

export class OpenAiTenetService implements IntentInterpreter, ViolationExplainer {
  private readonly client: OpenAiStructuredOutputClient;

  public constructor(
    apiKey: string,
    private readonly model = defaultOpenAiModel,
    client: OpenAiStructuredOutputClient = new OpenAI({ apiKey }),
  ) {
    this.client = client;
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
        format: zodTextFormat(
          OpenAiIntentProposalOutputSchema,
          "tenet_intent_proposal",
        ),
      },
    });

    if (!response.output_parsed) {
      throw new Error("OpenAI returned no structured Tenet proposal.");
    }

    return normalizeOpenAiIntentProposal(
      response.output_parsed,
      input.intent,
      this.model,
    );
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
          OpenAiDeveloperExplanationOutputSchema,
          "deterministic_violation_explanation",
        ),
      },
    });

    if (!response.output_parsed) {
      throw new Error("OpenAI returned no structured violation explanation.");
    }

    return normalizeOpenAiDeveloperExplanation(response.output_parsed);
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
