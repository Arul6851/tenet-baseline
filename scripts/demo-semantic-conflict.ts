import { copyFile, cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCheckCommand } from "../packages/cli/src/check.ts";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ecommerceFixture = join(workspaceRoot, "examples", "ecommerce");
const scenarioRoot = join(workspaceRoot, "fixtures", "demo-scenarios");

const discountFiles = [
  "src/pricing/discount-policy.ts",
  "src/loyalty/premium-loyalty-discount.ts",
] as const;

interface Scenario {
  label: string;
  overlay: string;
  expectedExitCode: number;
}

const scenarios: readonly Scenario[] = [
  {
    label: "BASELINE — no combined customer discount",
    overlay: "semantic-baseline",
    expectedExitCode: 0,
  },
  {
    label: "CHANGE A — holiday discount (20%)",
    overlay: "semantic-holiday",
    expectedExitCode: 0,
  },
  {
    label: "CHANGE B — premium loyalty discount (15%)",
    overlay: "semantic-premium",
    expectedExitCode: 0,
  },
  {
    label: "COMBINED / MERGED STATE — holiday (20%) + premium loyalty (15%)",
    overlay: "semantic-combined",
    expectedExitCode: 1,
  },
];

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

const applyOverlay = async (
  repositoryRoot: string,
  overlay: string,
): Promise<void> => {
  for (const relativeFilePath of discountFiles) {
    const overlayFile = join(scenarioRoot, overlay, relativeFilePath);

    try {
      await copyFile(overlayFile, join(repositoryRoot, relativeFilePath));
    } catch (error: unknown) {
      const code =
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : undefined;

      if (code !== "ENOENT") {
        throw error;
      }
    }
  }
};

const runScenario = async (scenario: Scenario): Promise<number> => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "tenet-semantic-demo-"));

  try {
    await cp(ecommerceFixture, repositoryRoot, { recursive: true });
    await writeStandaloneTsconfig(repositoryRoot);
    await applyOverlay(repositoryRoot, scenario.overlay);

    console.log("");
    console.log("=".repeat(72));
    console.log(scenario.label);
    console.log("=".repeat(72));

    const exitCode = await runCheckCommand({ repositoryPath: repositoryRoot });

    if (exitCode !== scenario.expectedExitCode) {
      throw new Error(
        `${scenario.label} returned ${exitCode}; expected ${scenario.expectedExitCode}.`,
      );
    }

    return exitCode;
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
};

const main = async (): Promise<void> => {
  let combinedExitCode = 0;

  for (const scenario of scenarios) {
    const exitCode = await runScenario(scenario);
    if (scenario.expectedExitCode === 1) {
      combinedExitCode = exitCode;
    }
  }

  console.log("");
  console.log(
    "The combined changes modify pricing and loyalty in separate files: Git has no textual conflict, but Tenet blocks the resulting 35% customer discount.",
  );
  process.exitCode = combinedExitCode;
};

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 2;
});
