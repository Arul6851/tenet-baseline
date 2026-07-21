import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";

import {
  ValidationRunIngestionResponseSchema,
  ValidationRunIngestionSchema,
  type TenetConfiguration,
  type ValidationRunIngestion,
} from "@tenet/contracts";
import type { TenetCheckResult } from "@tenet/engine";

export const CONTROL_PLANE_DIRECTORY = ".tenet";
export const CONTROL_PLANE_CONFIG_FILE = "control-plane.json";
export const CONTROL_PLANE_SYNC_TIMEOUT_MS = 5_000;

export interface ControlPlaneConnectionConfig {
  version: 1;
  controlPlaneUrl: string;
  repositorySlug: string;
  token?: string;
}

export interface ConnectCommandOptions {
  repositoryPath: string;
  controlPlaneUrl: string;
  repositorySlug: string;
  token?: string;
}

export interface ConnectTerminalOutput {
  log(message: string): void;
  error(message: string): void;
}

export interface ValidationSyncContext {
  /** Generated once by a `tenet check` invocation and retained for any retry. */
  idempotencyKey: string;
  connection: ControlPlaneConnectionConfig;
  repositoryRoot: string;
  configuration: TenetConfiguration;
  result: TenetCheckResult;
}

export interface ValidationSyncReceipt {
  validationRunId?: string;
}

export type ValidationRunSynchronizer = (
  context: ValidationSyncContext,
) => Promise<ValidationSyncReceipt>;

export type ControlPlaneConnectionLoader = (
  repositoryRoot: string,
) => Promise<ControlPlaneConnectionConfig | undefined>;

const defaultTerminal: ConnectTerminalOutput = {
  log: (message) => console.log(message),
  error: (message) => console.error(message),
};

const executeFile = promisify(execFile);

const configPathFor = (repositoryRoot: string): string =>
  join(repositoryRoot, CONTROL_PLANE_DIRECTORY, CONTROL_PLANE_CONFIG_FILE);

const configIgnorePathFor = (repositoryRoot: string): string =>
  join(repositoryRoot, CONTROL_PLANE_DIRECTORY, ".gitignore");

const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown control-plane error";

const assertNonEmptyString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Control-plane configuration requires a non-empty ${field}.`);
  }

  return value.trim();
};

const parseControlPlaneUrl = (value: unknown): string => {
  const url = assertNonEmptyString(value, "controlPlaneUrl");

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }
  } catch {
    throw new Error(
      "Control-plane configuration controlPlaneUrl must be an http(s) URL.",
    );
  }

  return url.replace(/\/$/u, "");
};

const parseConnectionConfig = (
  value: unknown,
): ControlPlaneConnectionConfig => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Control-plane configuration must be a JSON object.");
  }

  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1) {
    throw new Error("Control-plane configuration version must be 1.");
  }

  const token = candidate.token;
  if (token !== undefined && (typeof token !== "string" || token.trim().length === 0)) {
    throw new Error("Control-plane configuration token must be a non-empty string.");
  }

  return {
    version: 1,
    controlPlaneUrl: parseControlPlaneUrl(candidate.controlPlaneUrl),
    repositorySlug: assertNonEmptyString(candidate.repositorySlug, "repositorySlug"),
    ...(typeof token === "string" ? { token: token.trim() } : {}),
  };
};

const writeIgnoredConfigFile = async (repositoryRoot: string): Promise<void> => {
  const ignorePath = configIgnorePathFor(repositoryRoot);
  let current = "";

  try {
    current = await readFile(ignorePath, "utf8");
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;
    if (code !== "ENOENT") {
      throw error;
    }
  }

  const entries = current
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (entries.includes(CONTROL_PLANE_CONFIG_FILE)) {
    return;
  }

  const next = `${current.length > 0 && !current.endsWith("\n") ? `${current}\n` : current}${CONTROL_PLANE_CONFIG_FILE}\n`;
  await writeFile(ignorePath, next, "utf8");
};

export const controlPlaneConfigPath = configPathFor;

export const loadControlPlaneConnectionConfig: ControlPlaneConnectionLoader = async (
  repositoryRoot,
) => {
  try {
    const raw = await readFile(configPathFor(repositoryRoot), "utf8");
    return parseConnectionConfig(JSON.parse(raw) as unknown);
  } catch (error: unknown) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? error.code
        : undefined;
    if (code === "ENOENT") {
      return undefined;
    }

    throw error;
  }
};

export const writeControlPlaneConnectionConfig = async (
  repositoryRoot: string,
  input: Omit<ControlPlaneConnectionConfig, "version">,
): Promise<ControlPlaneConnectionConfig> => {
  const configuration = parseConnectionConfig({ version: 1, ...input });
  const directory = join(repositoryRoot, CONTROL_PLANE_DIRECTORY);
  await mkdir(directory, { recursive: true });
  await writeIgnoredConfigFile(repositoryRoot);
  await writeFile(
    configPathFor(repositoryRoot),
    `${JSON.stringify(configuration, null, 2)}\n`,
    "utf8",
  );
  return configuration;
};

export const runConnectCommand = async (
  options: ConnectCommandOptions,
  terminal: ConnectTerminalOutput = defaultTerminal,
): Promise<number> => {
  try {
    const connection = await writeControlPlaneConnectionConfig(options.repositoryPath, {
      controlPlaneUrl: options.controlPlaneUrl,
      repositorySlug: options.repositorySlug,
      ...(options.token === undefined ? {} : { token: options.token }),
    });
    const location = relative(
      options.repositoryPath,
      configPathFor(options.repositoryPath),
    );

    terminal.log(`Connected ${connection.repositorySlug} to ${connection.controlPlaneUrl}.`);
    terminal.log(`${location} is ignored by the repository-local .gitignore.`);
    return 0;
  } catch (error: unknown) {
    terminal.error(`tenet connect failed: ${toErrorMessage(error)}`);
    return 2;
  }
};

const gitValue = async (
  repositoryRoot: string,
  arguments_: readonly string[],
): Promise<string | undefined> => {
  try {
    const { stdout } = await executeFile(
      "git",
      ["-C", repositoryRoot, ...arguments_],
      { windowsHide: true },
    );
    const value = stdout.trim();
    return value.length === 0 ? undefined : value;
  } catch {
    return undefined;
  }
};

const gitLines = async (
  repositoryRoot: string,
  arguments_: readonly string[],
): Promise<readonly string[]> => {
  const value = await gitValue(repositoryRoot, arguments_);

  return value === undefined
    ? []
    : value
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean);
};

const collectGitContext = async (
  repositoryRoot: string,
): Promise<ValidationRunIngestion["git"]> => {
  const [headSha, baseSha, branch, author, message] = await Promise.all([
    gitValue(repositoryRoot, ["rev-parse", "HEAD"]),
    gitValue(repositoryRoot, ["rev-parse", "HEAD^"]),
    gitValue(repositoryRoot, ["branch", "--show-current"]),
    gitValue(repositoryRoot, ["log", "-1", "--format=%an"]),
    gitValue(repositoryRoot, ["log", "-1", "--format=%s"]),
  ]);

  return {
    ...(baseSha === undefined ? {} : { baseSha }),
    ...(headSha === undefined ? {} : { headSha }),
    ...(branch === undefined ? {} : { branch }),
    ...(author === undefined ? {} : { author }),
    ...(message === undefined ? {} : { message }),
  };
};

const collectChangedFiles = async (
  repositoryRoot: string,
  git: ValidationRunIngestion["git"],
): Promise<readonly string[]> => {
  if (git.baseSha !== undefined && git.headSha !== undefined) {
    return gitLines(repositoryRoot, [
      "diff",
      "--name-only",
      git.baseSha,
      git.headSha,
    ]);
  }

  if (git.headSha !== undefined) {
    return gitLines(repositoryRoot, [
      "show",
      "--format=",
      "--name-only",
      git.headSha,
    ]);
  }

  return [];
};

/**
 * Builds evidence-only control-plane telemetry after deterministic enforcement
 * is complete. The control plane validates this same shared shape on ingest.
 */
export const createValidationSyncPayload = async (
  context: ValidationSyncContext,
): Promise<ValidationRunIngestion> => {
  const git = await collectGitContext(context.repositoryRoot);
  const changedFiles = await collectChangedFiles(context.repositoryRoot, git);
  const payload = {
    version: 1,
    repository: {
      slug: context.connection.repositorySlug,
      name: context.configuration.repository.name,
      displayName:
        context.configuration.repository.displayName ??
        context.connection.repositorySlug,
      defaultBranch: "main",
    },
    source: "cli",
    completedAt: new Date().toISOString(),
    analyzerVersion: "tenet-cli/0.1.0",
    status: context.result.status,
    git,
    changedFiles,
    warnings: context.result.analysis.warnings,
    architecture: context.configuration.architecture,
    graph: {
      nodes: context.configuration.architecture.modules,
      edges: context.result.analysis.edges,
    },
    tenets: context.configuration.tenets,
    tenetEvaluations: context.result.evaluations,
    violations: context.result.violations,
    health: {
      architecture: context.result.architectureHealth,
      intent: context.result.intentHealth,
    },
    idempotencyKey: context.idempotencyKey,
  };

  return ValidationRunIngestionSchema.parse(payload);
};

const validationRunsUrl = (controlPlaneUrl: string): string =>
  new URL("api/validation-runs", `${controlPlaneUrl}/`).toString();

export const synchronizeValidationRun: ValidationRunSynchronizer = async (
  context,
) => {
  const response = await fetch(validationRunsUrl(context.connection.controlPlaneUrl), {
    method: "POST",
    signal: AbortSignal.timeout(CONTROL_PLANE_SYNC_TIMEOUT_MS),
    headers: {
      "content-type": "application/json",
      ...(context.connection.token === undefined
        ? {}
        : { authorization: `Bearer ${context.connection.token}` }),
    },
    body: JSON.stringify(await createValidationSyncPayload(context)),
  });

  if (!response.ok) {
    throw new Error(`Control plane returned ${response.status} ${response.statusText}.`);
  }

  const responseBody = ValidationRunIngestionResponseSchema.parse(
    await response.json(),
  );
  return {
    validationRunId: responseBody.validationRunId,
  };
};
