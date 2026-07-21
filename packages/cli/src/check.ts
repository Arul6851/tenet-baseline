import { resolve } from "node:path";

import {
  defaultTenetConfigPath,
  loadTenetConfiguration,
  runArchitectureCheck,
  type ArchitectureCheckResult,
} from "@tenet/engine";

export interface TerminalOutput {
  log(message: string): void;
  error(message: string): void;
}

export interface CheckCommandOptions {
  repositoryPath?: string;
  configPath?: string;
}

const defaultTerminal: TerminalOutput = {
  log: (message) => console.log(message),
  error: (message) => console.error(message),
};

const displayModule = (module: string): string =>
  module.slice(0, 1).toUpperCase() + module.slice(1);

const writeArchitectureHeader = (
  result: ArchitectureCheckResult,
  terminal: TerminalOutput,
): void => {
  terminal.log("TENET");
  terminal.log("");
  terminal.log("Validating repository...");
  terminal.log("");
  terminal.log(`Architecture       ${result.architectureHealth.score}/100`);
  terminal.log("");
  terminal.log("Architecture Tenets");
};

const writeWarnings = (
  result: ArchitectureCheckResult,
  terminal: TerminalOutput,
): void => {
  if (result.analysis.warnings.length === 0) {
    return;
  }

  terminal.log("");
  terminal.log("Analysis warnings (non-blocking)");

  for (const warning of result.analysis.warnings) {
    terminal.log(
      `! ${warning.file}:${warning.line} ${warning.message}`,
    );
  }
};

const writeViolation = (
  result: ArchitectureCheckResult,
  terminal: TerminalOutput,
): void => {
  const [violation] = result.violations;

  if (!violation?.architecture) {
    return;
  }

  terminal.log("");
  terminal.log(`${result.violations.length} blocking violation${result.violations.length === 1 ? "" : "s"}`);
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
    terminal.log(
      `${evidence.file}:${evidence.line ?? "?"} — ${evidence.excerpt}`,
    );
  }

  terminal.log("");
  terminal.log("COMMIT BLOCKED");
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
    const result = await runArchitectureCheck({
      repositoryRoot,
      configuration,
    });

    writeArchitectureHeader(result, terminal);

    for (const evaluation of result.evaluations) {
      terminal.log(
        `${evaluation.status === "satisfied" ? "✓" : "✕"} ${evaluation.summary}`,
      );
    }

    if (result.status === "BLOCK") {
      writeViolation(result, terminal);
      writeWarnings(result, terminal);
      return 1;
    }

    terminal.log("");
    terminal.log("No blocking violations.");
    writeWarnings(result, terminal);
    terminal.log("");
    terminal.log(result.status);
    return 0;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unexpected validation error";
    terminal.error(`tenet check failed: ${message}`);
    return 2;
  }
};
