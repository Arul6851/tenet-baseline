import { copyFile, cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCheckCommand, type TerminalOutput } from "../packages/cli/src/check.ts";
import { writeControlPlaneConnectionConfig } from "../packages/cli/src/control-plane.ts";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ecommerceFixture = join(workspaceRoot, "examples", "ecommerce");
const scenarioRoot = join(workspaceRoot, "fixtures", "demo-scenarios");
const architectureDriftOverlay = join(
  scenarioRoot,
  "architecture-drift",
  "src",
  "checkout",
  "checkout-service.ts",
);
const discountFiles = [
  "src/pricing/discount-policy.ts",
  "src/loyalty/premium-loyalty-discount.ts",
] as const;
const repositorySlug = "commerce-platform";

interface Scenario {
  label: string;
  discountOverlay: "semantic-baseline" | "semantic-combined";
  architectureDrift: boolean;
  expectedExitCode: number;
}

const scenarios: readonly Scenario[] = [
  {
    label: "RUN 1 - Compliant",
    discountOverlay: "semantic-baseline",
    architectureDrift: false,
    expectedExitCode: 0,
  },
  {
    label: "RUN 2 - Architectural Drift",
    discountOverlay: "semantic-baseline",
    architectureDrift: true,
    expectedExitCode: 1,
  },
  {
    label: "RUN 3 - Fixed Architecture",
    discountOverlay: "semantic-baseline",
    architectureDrift: false,
    expectedExitCode: 0,
  },
  {
    label: "RUN 4 - Semantic Conflict",
    discountOverlay: "semantic-combined",
    architectureDrift: false,
    expectedExitCode: 1,
  },
  {
    label: "RUN 5 - Semantic Conflict Fixed",
    discountOverlay: "semantic-baseline",
    architectureDrift: false,
    expectedExitCode: 0,
  },
];

const asRecord = (value: unknown, label: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object.`);
  }

  return value as Record<string, unknown>;
};

const asArray = (value: unknown, label: string): readonly unknown[] => {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be a JSON array.`);
  }

  return value;
};

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
};

const requiredNumber = (value: unknown, label: string): number => {
  if (typeof value !== "number") {
    throw new Error(`${label} must be a number.`);
  }

  return value;
};

const writeStandaloneTsconfig = async (repositoryRoot: string): Promise<void> => {
  await writeFile(
    join(repositoryRoot, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          rootDir: "src",
          outDir: "dist",
        },
        include: ["src/**/*.ts"],
      },
      null,
      2,
    )}\n`,
  );
};

const applyDiscountOverlay = async (
  repositoryRoot: string,
  overlay: Scenario["discountOverlay"],
): Promise<void> => {
  for (const relativeFilePath of discountFiles) {
    await copyFile(
      join(scenarioRoot, overlay, relativeFilePath),
      join(repositoryRoot, relativeFilePath),
    );
  }
};

const createScenarioRepository = async (scenario: Scenario): Promise<string> => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "tenet-control-plane-demo-"));
  await cp(ecommerceFixture, repositoryRoot, { recursive: true });
  await writeStandaloneTsconfig(repositoryRoot);
  await applyDiscountOverlay(repositoryRoot, scenario.discountOverlay);

  if (scenario.architectureDrift) {
    await copyFile(
      architectureDriftOverlay,
      join(repositoryRoot, "src", "checkout", "checkout-service.ts"),
    );
  }

  return repositoryRoot;
};

const terminalFor = (lines: string[]): TerminalOutput => ({
  log: (message) => {
    lines.push(message);
    console.log(message);
  },
  error: (message) => {
    lines.push(message);
    console.error(message);
  },
});

const synchronizationRunId = (lines: readonly string[]): string => {
  const synchronizationLine = lines.find((line) =>
    line.startsWith("✓ Validation synchronized ("),
  );
  const match = synchronizationLine === undefined
    ? undefined
    : /^✓ Validation synchronized \(([^)]+)\)$/u.exec(synchronizationLine);

  return requiredString(match?.[1], "control-plane validation run id");
};

const readJson = async (url: string): Promise<unknown> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Read API ${url} returned ${response.status} ${response.statusText}.`);
  }

  return response.json();
};

const verifyPersistedHistory = async (
  controlPlaneUrl: string,
  expectedRunIds: readonly string[],
): Promise<void> => {
  const baseUrl = new URL(
    `api/repositories/${repositorySlug}`,
    `${controlPlaneUrl}/`,
  ).toString();
  const [summaryPayload, validationsPayload, violationsPayload, healthPayload] =
    await Promise.all([
      readJson(baseUrl),
      readJson(`${baseUrl}/validation-runs`),
      readJson(`${baseUrl}/violations`),
      readJson(`${baseUrl}/health`),
    ]);
  const summary = asRecord(summaryPayload, "repository summary");
  const validationRuns = asArray(
    asRecord(validationsPayload, "validation response").runs,
    "validation response runs",
  );
  const violations = asArray(
    asRecord(violationsPayload, "violation response").violations,
    "violation response violations",
  );
  const snapshots = asArray(
    asRecord(healthPayload, "health response").snapshots,
    "health response snapshots",
  );

  const persistedRunIds = new Set(
    validationRuns.map((run) =>
      requiredString(asRecord(run, "validation run").id, "validation run id"),
    ),
  );
  for (const runId of expectedRunIds) {
    if (!persistedRunIds.has(runId)) {
      throw new Error(`Expected persisted validation run ${runId} was not returned by the API.`);
    }
  }

  if (requiredNumber(summary.activeViolationCount, "activeViolationCount") !== 0) {
    throw new Error("Expected fixed final state to have zero active violations.");
  }
  if (snapshots.length < expectedRunIds.length) {
    throw new Error("Expected one persisted health snapshot for each demo run.");
  }
  if (violations.length < 2) {
    throw new Error("Expected logical architectural and semantic violations to be persisted.");
  }

  const latestSnapshot = asRecord(snapshots[0], "latest health snapshot");
  if (
    requiredNumber(latestSnapshot.architectureScore, "latest architecture score") !== 100 ||
    requiredNumber(latestSnapshot.intentScore, "latest intent score") !== 100
  ) {
    throw new Error("Expected the final fixed state to restore both health scores to 100.");
  }
};

const runScenario = async (
  scenario: Scenario,
  controlPlaneUrl: string,
): Promise<string> => {
  const repositoryRoot = await createScenarioRepository(scenario);

  try {
    await writeControlPlaneConnectionConfig(repositoryRoot, {
      controlPlaneUrl,
      repositorySlug,
    });
    console.log("");
    console.log("=".repeat(72));
    console.log(scenario.label);
    console.log("=".repeat(72));
    const lines: string[] = [];
    const exitCode = await runCheckCommand(
      { repositoryPath: repositoryRoot },
      terminalFor(lines),
    );

    if (exitCode !== scenario.expectedExitCode) {
      throw new Error(
        `${scenario.label} returned ${exitCode}; expected ${scenario.expectedExitCode}.`,
      );
    }

    return synchronizationRunId(lines);
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
};

const main = async (): Promise<void> => {
  const configuredUrl = globalThis.process.env.TENET_CONTROL_PLANE_URL;
  const controlPlaneUrl = requiredString(
    configuredUrl,
    "TENET_CONTROL_PLANE_URL",
  ).replace(/\/$/u, "");
  const runIds: string[] = [];

  for (const scenario of scenarios) {
    runIds.push(await runScenario(scenario, controlPlaneUrl));
  }

  await verifyPersistedHistory(controlPlaneUrl, runIds);
  console.log("");
  console.log("Persisted history verified: 5 real validation runs, 2 resolved violations, 100/100 final health.");
};

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  globalThis.process.exitCode = 2;
});
