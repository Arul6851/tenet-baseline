import type {
  DeveloperExplanation,
  DeveloperExplanationRequest,
  IntentInterpreter,
  IntentProposal,
  NaturalLanguageTenetInput,
  ViolationExplainer,
} from "@tenet/contracts";

export type { IntentInterpreter, ViolationExplainer } from "@tenet/contracts";

export class AiServiceUnavailableError extends Error {
  public constructor(message = "The AI intent service is not configured.") {
    super(message);
    this.name = "AiServiceUnavailableError";
  }
}

/**
 * Safe default for local validation and test environments. It deliberately
 * cannot create a Tenet, change enforcement, or alter a deterministic result.
 */
export class DisabledIntentService
  implements IntentInterpreter, ViolationExplainer
{
  async proposeTenet(input: NaturalLanguageTenetInput): Promise<IntentProposal> {
    void input;
    throw new AiServiceUnavailableError();
  }

  async explainViolation(
    input: DeveloperExplanationRequest,
  ): Promise<DeveloperExplanation> {
    void input;
    throw new AiServiceUnavailableError();
  }
}
