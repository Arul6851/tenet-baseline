import { copyFile, cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ValidationRunIngestion } from "@tenet/contracts";

import { runCheckCommand, type TerminalOutput } from "../packages/cli/src/check.ts";
import {
  createValidationSyncPayload,
  synchronizeValidationPayload,
  writeControlPlaneConnectionConfig,
  type ValidationRunSynchronizer,
  type ValidationSyncContext,
} from "../packages/cli/src/control-plane.ts";

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

interface CompletedScenario {
  validationRunId: string;
  synchronizationContext: ValidationSyncContext;
  synchronizationPayload: ValidationRunIngestion;
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

const expectedArchitectureScores = [100, 95, 100, 100, 100] as const;
const expectedIntentScores = [100, 100, 100, 0, 100] as const;
const expectedStatuses = ["PASS", "BLOCK", "PASS", "BLOCK", "PASS"] as const;

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

const assertEqual = (
  actual: unknown,
  expected: unknown,
  label: string,
): void => {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, received ${String(actual)}.`);
  }
};

const findViolationByType = (
  violations: readonly unknown[],
  type: "architecture" | "semantic",
): Record<string, unknown> => {
  const violation = violations
    .map((candidate) => asRecord(candidate, "persisted violation"))
    .find((candidate) => candidate.type === type);

  if (!violation) {
    throw new Error(`Expected a persisted ${type} violation.`);
  }

  return violation;
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
  const [
    summaryPayload,
    validationsPayload,
    violationsPayload,
    healthPayload,
    tenetsPayload,
  ] = await Promise.all([
    readJson(baseUrl),
    readJson(`${baseUrl}/validation-runs`),
    readJson(`${baseUrl}/violations`),
    readJson(`${baseUrl}/health`),
    readJson(`${baseUrl}/tenets`),
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
  const tenets = asArray(
    asRecord(tenetsPayload, "tenet response").tenets,
    "tenet response tenets",
  );

  if (new Set(expectedRunIds).size !== expectedRunIds.length) {
    throw new Error("Expected demo run ids must be unique.");
  }
  if (validationRuns.length !== expectedRunIds.length) {
    throw new Error(
      `Expected exactly ${expectedRunIds.length} logical validation runs; received ${validationRuns.length}.`,
    );
  }
  if (snapshots.length !== expectedRunIds.length) {
    throw new Error(
      `Expected exactly ${expectedRunIds.length} health snapshots; received ${snapshots.length}.`,
    );
  }
  if (tenets.length !== 2) {
    throw new Error(`Expected exactly two persisted Tenets; received ${tenets.length}.`);
  }
  if (
    !tenets.some((tenet) =>
      asRecord(tenet, "persisted Tenet").name === "Checkout Persistence Boundary") ||
    !tenets.some((tenet) =>
      asRecord(tenet, "persisted Tenet").name === "Maximum Combined Discount")
  ) {
    throw new Error("Read API did not return both active deterministic Tenets.");
  }

  const runById = new Map<string, Record<string, unknown>>();
  for (const run of validationRuns) {
    const record = asRecord(run, "validation run");
    const runId = requiredString(record.id, "validation run id");
    if (runById.has(runId)) {
      throw new Error(`Read API returned duplicate validation run ${runId}.`);
    }
    runById.set(runId, record);
  }

  const snapshotByRunId = new Map<string, Record<string, unknown>>();
  for (const snapshot of snapshots) {
    const record = asRecord(snapshot, "health snapshot");
    const validationRunId = requiredString(
      record.validationRunId,
      "health snapshot validation run id",
    );
    if (snapshotByRunId.has(validationRunId)) {
      throw new Error(`Read API returned duplicate health snapshot for ${validationRunId}.`);
    }
    snapshotByRunId.set(validationRunId, record);
  }

  const architectureHistory: number[] = [];
  const intentHistory: number[] = [];
  for (const [index, runId] of expectedRunIds.entries()) {
    const run = runById.get(runId);
    const snapshot = snapshotByRunId.get(runId);
    if (!run || !snapshot) {
      throw new Error(`Expected persisted validation run ${runId} was not returned by both APIs.`);
    }

    const architectureScore = requiredNumber(
      run.architectureScore,
      `run ${index + 1} architecture score`,
    );
    const intentScore = requiredNumber(run.intentScore, `run ${index + 1} intent score`);
    assertEqual(run.status, expectedStatuses[index], `run ${index + 1} status`);
    assertEqual(
      architectureScore,
      expectedArchitectureScores[index],
      `run ${index + 1} architecture score`,
    );
    assertEqual(intentScore, expectedIntentScores[index], `run ${index + 1} intent score`);
    assertEqual(
      requiredNumber(snapshot.architectureScore, `snapshot ${index + 1} architecture score`),
      expectedArchitectureScores[index],
      `snapshot ${index + 1} architecture score`,
    );
    assertEqual(
      requiredNumber(snapshot.intentScore, `snapshot ${index + 1} intent score`),
      expectedIntentScores[index],
      `snapshot ${index + 1} intent score`,
    );
    architectureHistory.push(architectureScore);
    intentHistory.push(intentScore);
  }

  assertEqual(
    requiredNumber(summary.activeViolationCount, "activeViolationCount"),
    0,
    "final active violation count",
  );
  const latestHealth = asRecord(summary.latestHealth, "repository latest health");
  assertEqual(latestHealth.architectureScore, 100, "repository summary architecture score");
  assertEqual(latestHealth.intentScore, 100, "repository summary intent score");

  if (violations.length !== 2) {
    throw new Error(`Expected exactly two logical violations; received ${violations.length}.`);
  }
  const architectureViolation = findViolationByType(violations, "architecture");
  const semanticViolation = findViolationByType(violations, "semantic");
  for (const [label, violation] of [
    ["architectural", architectureViolation],
    ["semantic", semanticViolation],
  ] as const) {
    assertEqual(violation.status, "resolved", `${label} violation lifecycle status`);
    requiredString(violation.fingerprint, `${label} violation fingerprint`);
    requiredString(violation.firstSeenAt, `${label} violation first seen timestamp`);
    requiredString(violation.lastSeenAt, `${label} violation last seen timestamp`);
    requiredString(violation.resolvedAt, `${label} violation resolved timestamp`);
  }

  const architectureDetails = asRecord(
    asRecord(architectureViolation.details, "architectural violation details").architecture,
    "architectural violation deterministic details",
  );
  assertEqual(architectureDetails.sourceModule, "checkout", "architectural source module");
  assertEqual(architectureDetails.targetModule, "database", "architectural target module");
  const architectureEvidence = asArray(
    architectureViolation.evidence,
    "architectural violation evidence",
  );
  if (!architectureEvidence.some((evidence) =>
    asRecord(evidence, "architectural evidence").file === "src/checkout/checkout-service.ts")) {
    throw new Error("Architectural violation did not retain checkout import evidence.");
  }

  const semanticDetails = asRecord(
    asRecord(semanticViolation.details, "semantic violation details").semantic,
    "semantic violation deterministic details",
  );
  assertEqual(semanticDetails.maximumPercent, 30, "semantic maximum discount");
  assertEqual(semanticDetails.potentialPercent, 35, "semantic potential discount");
  const contributingDiscounts = asArray(
    semanticDetails.contributingDiscounts,
    "semantic contributing discounts",
  );
  if (
    contributingDiscounts.length !== 2 ||
    !contributingDiscounts.some((discount) =>
      asRecord(discount, "contributing discount").id === "holiday-discount") ||
    !contributingDiscounts.some((discount) =>
      asRecord(discount, "contributing discount").id === "premium-loyalty-discount")
  ) {
    throw new Error("Semantic violation did not retain both deterministic discount declarations.");
  }
  const semanticEvidence = asArray(semanticViolation.evidence, "semantic violation evidence");
  if (
    !semanticEvidence.some((evidence) =>
      asRecord(evidence, "semantic evidence").file === "src/pricing/discount-policy.ts") ||
    !semanticEvidence.some((evidence) =>
      asRecord(evidence, "semantic evidence").file === "src/loyalty/premium-loyalty-discount.ts")
  ) {
    throw new Error("Semantic violation did not retain both declaration evidence files.");
  }

  const architectureDriftRun = runById.get(expectedRunIds[1] ?? "");
  if (!architectureDriftRun) {
    throw new Error("Expected persisted architectural-drift validation run.");
  }
  const graphSnapshot = asRecord(
    architectureDriftRun.graphSnapshot,
    "architectural-drift graph snapshot",
  );
  const graphEdges = asArray(graphSnapshot.edges, "architectural-drift graph edges");
  if (!graphEdges.some((edge) => {
    const record = asRecord(edge, "architectural-drift graph edge");
    return record.sourceModule === "checkout" && record.targetModule === "database";
  })) {
    throw new Error("Architectural-drift graph snapshot is missing checkout -> database.");
  }
  const intendedArchitecture = asRecord(
    graphSnapshot.intendedArchitecture,
    "intended architecture graph snapshot",
  );
  const intendedEdges = asArray(intendedArchitecture.intendedEdges, "intended architecture edges");
  if (
    !intendedEdges.some((edge) =>
      Array.isArray(edge) && edge[0] === "checkout" && edge[1] === "gateway") ||
    !intendedEdges.some((edge) =>
      Array.isArray(edge) && edge[0] === "gateway" && edge[1] === "database")
  ) {
    throw new Error("Graph snapshot did not retain the intended checkout -> gateway -> database route.");
  }

  console.log(`Architecture Health history: ${architectureHistory.join(" -> ")}`);
  console.log(`Intent Health history: ${intentHistory.join(" -> ")}`);
};

const runScenario = async (
  scenario: Scenario,
  controlPlaneUrl: string,
): Promise<CompletedScenario> => {
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
    let synchronizationContext: ValidationSyncContext | undefined;
    let synchronizationPayload: ValidationRunIngestion | undefined;
    let validationRunId: string | undefined;
    const synchronizer: ValidationRunSynchronizer = async (context) => {
      synchronizationContext = context;
      synchronizationPayload = await createValidationSyncPayload(context);
      const receipt = await synchronizeValidationPayload(
        context,
        synchronizationPayload,
      );
      validationRunId = receipt.validationRunId;
      return receipt;
    };
    const exitCode = await runCheckCommand(
      { repositoryPath: repositoryRoot, synchronizer },
      terminalFor(lines),
    );

    if (exitCode !== scenario.expectedExitCode) {
      throw new Error(
        `${scenario.label} returned ${exitCode}; expected ${scenario.expectedExitCode}.`,
      );
    }
    if (
      synchronizationContext === undefined ||
      synchronizationPayload === undefined
    ) {
      throw new Error(`${scenario.label} did not create a synchronization context.`);
    }

    return {
      validationRunId: requiredString(validationRunId, "control-plane validation run id"),
      synchronizationContext,
      synchronizationPayload,
    };
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
};

const loadSingleResumableRun = async (controlPlaneUrl: string): Promise<string> => {
  const baseUrl = new URL(
    `api/repositories/${repositorySlug}`,
    `${controlPlaneUrl}/`,
  ).toString();
  const payload = asRecord(
    await readJson(`${baseUrl}/validation-runs`),
    "resume validation response",
  );
  const runs = asArray(payload.runs, "resume validation runs");

  if (runs.length !== 1) {
    throw new Error(
      `--resume requires exactly one already-persisted run; received ${runs.length}.`,
    );
  }

  const run = asRecord(runs[0], "resumable validation run");
  assertEqual(run.status, "PASS", "resumable run status");
  assertEqual(
    requiredNumber(run.architectureScore, "resumable architecture score"),
    100,
    "resumable architecture score",
  );
  assertEqual(
    requiredNumber(run.intentScore, "resumable intent score"),
    100,
    "resumable intent score",
  );

  return requiredString(run.id, "resumable validation run id");
};

const main = async (): Promise<void> => {
  const configuredUrl = globalThis.process.env.TENET_CONTROL_PLANE_URL;
  const controlPlaneUrl = requiredString(
    configuredUrl,
    "TENET_CONTROL_PLANE_URL",
  ).replace(/\/$/u, "");
  const runIds: string[] = [];
  const resume = globalThis.process.argv.includes("--resume");
  let scenariosToRun = scenarios;

  if (resume) {
    runIds.push(await loadSingleResumableRun(controlPlaneUrl));
    scenariosToRun = scenarios.slice(1);
    console.log("Resuming from the already-persisted compliant Run 1.");
  }

  let finalScenario: CompletedScenario | undefined;
  for (const scenario of scenariosToRun) {
    const completed = await runScenario(scenario, controlPlaneUrl);
    runIds.push(completed.validationRunId);
    finalScenario = completed;
  }

  if (finalScenario === undefined) {
    throw new Error("Persisted history demo did not execute a synchronizable validation run.");
  }

  const retryReceipt = await synchronizeValidationPayload(
    finalScenario.synchronizationContext,
    finalScenario.synchronizationPayload,
  );
  assertEqual(
    retryReceipt.validationRunId,
    runIds.at(-1),
    "idempotent validation run id",
  );

  await verifyPersistedHistory(controlPlaneUrl, runIds);
  console.log("");
  console.log("Idempotency verified: repeat synchronization retained one logical run.");
  console.log("Persisted history verified: 5 real validation runs, 2 resolved violations, 100/100 final health.");
};

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  globalThis.process.exitCode = 2;
});
