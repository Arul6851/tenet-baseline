import { copyFile, cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { runCheckCommand, type TerminalOutput } from "./check.js";

const workspaceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const ecommerceFixture = join(workspaceRoot, "examples", "ecommerce");
const driftOverlay = join(
  workspaceRoot,
  "fixtures",
  "demo-scenarios",
  "architecture-drift",
  "src",
  "checkout",
  "checkout-service.ts",
);
const temporaryDirectories: string[] = [];

const createCapturedTerminal = (): {
  output: TerminalOutput;
  lines: string[];
  errors: string[];
} => {
  const lines: string[] = [];
  const errors: string[] = [];
  return {
    output: {
      log: (message) => lines.push(message),
      error: (message) => errors.push(message),
    },
    lines,
    errors,
  };
};

const createDriftRepository = async (): Promise<string> => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "tenet-cli-drift-"));
  temporaryDirectories.push(repositoryRoot);
  await cp(ecommerceFixture, repositoryRoot, { recursive: true });
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
  await copyFile(
    driftOverlay,
    join(repositoryRoot, "src", "checkout", "checkout-service.ts"),
  );
  return repositoryRoot;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("tenet check", () => {
  it("prints PASS and returns zero for the compliant ecommerce fixture", async () => {
    const terminal = createCapturedTerminal();

    const exitCode = await runCheckCommand(
      { repositoryPath: ecommerceFixture },
      terminal.output,
    );

    expect(exitCode).toBe(0);
    expect(terminal.errors).toEqual([]);
    expect(terminal.lines.join("\n")).toContain("Architecture       100/100");
    expect(terminal.lines).toContain("PASS");
  });

  it("prints a drift report and returns non-zero for a blocking direct import", async () => {
    const repositoryRoot = await createDriftRepository();
    const terminal = createCapturedTerminal();

    const exitCode = await runCheckCommand(
      { repositoryPath: repositoryRoot },
      terminal.output,
    );

    expect(exitCode).toBe(1);
    expect(terminal.errors).toEqual([]);
    expect(terminal.lines.join("\n")).toContain("Architecture       95/100");
    expect(terminal.lines).toContain("ARCHITECTURAL DRIFT");
    expect(terminal.lines).toContain("COMMIT BLOCKED");
  });
});
