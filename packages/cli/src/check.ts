import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

import {
  defaultTenetConfigPath,
  loadTenetConfiguration,
  runTenetCheck,
  type TenetCheckResult,
} from "@tenet/engine";
import type { TenetEvaluation, Violation } from "@tenet/contracts";

import {
  loadControlPlaneConnectionConfig,
  synchronizeValidationRun,
  type ControlPlaneConnectionLoader,
  type ValidationRunSynchronizer,
} from "./control-plane.js";

export interface TerminalOutput {
  log(message: string): void;
  error(message: string): void;
}

export interface CheckCommandOptions {
  repositoryPath?: string;
  configPath?: string;
  connectionLoader?: ControlPlaneConnectionLoader;
  synchronizer?: ValidationRunSynchronizer;
}

const defaultTerminal: TerminalOutput = {
  log: (message) => console.log(message),
  error: (message) => console.error(message),
};

const displayModule = (module: string): string =>
  module.slice(0, 1).toUpperCase() + module.slice(1);

const displayPercent = (value: number): string => `${value}%`;

const displayDiscount = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replaceAll("-", " ")
    .replace(/\b\w/gu, (character) => character.toUpperCase());

const isBlockingViolation = (violation: Violation): boolean =>
  violation.enforcement === "block_merge" &&
  (violation.status === "active" || violation.status === "blocked");

const toSynchronizationErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown synchronization error";

const writeHeader = (
  result: TenetCheckResult,
  terminal: TerminalOutput,
): void => {
  terminal.log("TENET");
  terminal.log("");
  terminal.log("Validating repository...");
  terminal.log("");
  terminal.log(`Architecture       ${result.architectureHealth.score}/100`);
  terminal.log(`Intent             ${result.intentHealth.score}/100`);
};

const writeEvaluations = (
  title: string,
  evaluations: readonly TenetEvaluation[],
  terminal: TerminalOutput,
): void => {
  terminal.log("");
  terminal.log(title);

  if (evaluations.length === 0) {
    terminal.log("- No active Tenets.");
    return;
  }

  for (const evaluation of evaluations) {
    const marker = evaluation.status === "satisfied" ? "✓" : "✕";
    terminal.log(`${marker} ${evaluation.summary}`);
  }
};

const writeWarnings = (
  result: TenetCheckResult,
  terminal: TerminalOutput,
): void => {
  if (result.analysis.warnings.length === 0) {
    return;
  }

  terminal.log("");
  terminal.log("Analysis warnings (non-blocking)");

  for (const warning of result.analysis.warnings) {
    terminal.log(`! ${warning.file}:${warning.line} ${warning.message}`);
  }
};

const writeArchitectureViolation = (
  violation: Violation,
  terminal: TerminalOutput,
): void => {
  if (!violation.architecture) {
    return;
  }

  terminal.log("");
  terminal.log("ARCHITECTURAL DRIFT");
  terminal.log("");
  terminal.log(violation.architecture.sourceModule);
  terminal.log("   |");
  terminal.log("   v");
  terminal.log(violation.architecture.targetModule);
  terminal.log("");
  terminal.log("Expected:");
  terminal.log("");
  terminal.log(
    violation.architecture.expectedRoute.map(displayModule).join(" -> "),
  );
  terminal.log("");
  terminal.log("Actual:");
  terminal.log("");
  terminal.log(
    `${displayModule(violation.architecture.actualDependency.sourceModule)} -> ${displayModule(violation.architecture.actualDependency.targetModule)}`,
  );
  terminal.log("");
  terminal.log("Violated Tenet:");
  terminal.log("");
  terminal.log(`"${violation.tenetDescription ?? violation.message}"`);
  terminal.log("");
  terminal.log("Evidence:");

  for (const evidence of violation.evidence) {
    terminal.log(`${evidence.file}:${evidence.line ?? "?"} — ${evidence.excerpt}`);
  }

  terminal.log("");
  terminal.log("COMMIT BLOCKED");
};

const writeSemanticViolation = (
  violation: Violation,
  terminal: TerminalOutput,
): void => {
  if (!violation.semantic) {
    return;
  }

  const details = violation.semantic;
  const terms = details.contributingDiscounts.map((discount) =>
    displayPercent(discount.percent),
  );

  terminal.log("");
  terminal.log("SEMANTIC CONFLICT");
  terminal.log("");
  terminal.log(violation.tenetName ?? "Business Tenet");
  terminal.log("");
  terminal.log("Maximum allowed:");
  terminal.log(displayPercent(details.maximumPercent));
  terminal.log("");
  terminal.log("Potential:");
  terminal.log(displayPercent(details.potentialPercent));
  terminal.log("");
  terminal.log("Contributing evidence:");

  for (const discount of details.contributingDiscounts) {
    terminal.log(
      `${displayDiscount(discount.name ?? discount.id)}       ${displayPercent(discount.percent)} (${discount.sourceFile}:${discount.line})`,
    );
  }

  terminal.log("");
  terminal.log(`${terms.join(" + ")} = ${displayPercent(details.potentialPercent)}`);
  terminal.log("");
  terminal.log("Violated Tenet:");
  terminal.log("");
  terminal.log(`"${violation.tenetDescription ?? violation.message}"`);
  terminal.log("");
  terminal.log("Git has no textual conflict.");
  terminal.log("The resulting code violates declared business intent.");
  terminal.log("");
  terminal.log("CHANGE BLOCKED");
};

const writeBlockingViolations = (
  violations: readonly Violation[],
  terminal: TerminalOutput,
): void => {
  const blockingViolations = violations.filter(isBlockingViolation);
  terminal.log("");
  terminal.log(
    `${blockingViolations.length} blocking violation${blockingViolations.length === 1 ? "" : "s"}`,
  );

  for (const violation of blockingViolations) {
    if (violation.type === "architecture") {
      writeArchitectureViolation(violation, terminal);
      continue;
    }

    if (violation.type === "semantic") {
      writeSemanticViolation(violation, terminal);
      continue;
    }

    terminal.log("");
    terminal.log(violation.title);
    terminal.log(violation.message);
    terminal.log("CHANGE BLOCKED");
  }
};

/**
 * Synchronization is intentionally best-effort telemetry. It runs only after
 * the deterministic result has been rendered, and never changes that result.
 */
const synchronizeAfterLocalValidation = async (
  input: {
    repositoryRoot: string;
    configuration: Awaited<ReturnType<typeof loadTenetConfiguration>>;
    result: TenetCheckResult;
    options: CheckCommandOptions;
  },
  terminal: TerminalOutput,
): Promise<void> => {
  terminal.log("");
  terminal.log("Control plane:");

  try {
    const connection = await (
      input.options.connectionLoader ?? loadControlPlaneConnectionConfig
    )(input.repositoryRoot);
    if (connection === undefined) {
      terminal.log("- Not configured (local validation only).");
      return;
    }

    const receipt = await (input.options.synchronizer ?? synchronizeValidationRun)(
      {
        idempotencyKey: randomUUID(),
        connection,
        repositoryRoot: input.repositoryRoot,
        configuration: input.configuration,
        result: input.result,
      },
    );
    terminal.log(
      receipt.validationRunId === undefined
        ? "✓ Validation synchronized"
        : `✓ Validation synchronized (${receipt.validationRunId})`,
    );
  } catch (error: unknown) {
    terminal.log(
      `! Synchronization unavailable: ${toSynchronizationErrorMessage(error)}`,
    );
  }
};

export const runCheckCommand = async (
  options: CheckCommandOptions,
  terminal: TerminalOutput = defaultTerminal,
): Promise<number> => {
  try {
    const invocationDirectory = process.env.INIT_CWD ?? process.cwd();
    const repositoryRoot = resolve(
      invocationDirectory,
      options.repositoryPath ?? ".",
    );
    const configPath = options.configPath
      ? resolve(invocationDirectory, options.configPath)
      : defaultTenetConfigPath(repositoryRoot);
    const configuration = await loadTenetConfiguration(configPath);
    const result = await runTenetCheck({
      repositoryRoot,
      configuration,
    });

    writeHeader(result, terminal);
    writeEvaluations("Architecture Tenets", result.architectureEvaluations, terminal);
    writeEvaluations("Business Tenets", result.businessEvaluations, terminal);

    let exitCode: number;
    if (result.status === "BLOCK") {
      writeBlockingViolations(result.violations, terminal);
      writeWarnings(result, terminal);
      exitCode = 1;
    } else {
      terminal.log("");
      terminal.log("No blocking violations.");
      writeWarnings(result, terminal);
      terminal.log("");
      terminal.log(result.status);
      exitCode = 0;
    }

    await synchronizeAfterLocalValidation(
      { repositoryRoot, configuration, result, options },
      terminal,
    );
    return exitCode;
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unexpected validation error";
    terminal.error(`tenet check failed: ${message}`);
    return 2;
  }
};
