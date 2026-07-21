import { copyFile, cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCheckCommand } from "../packages/cli/src/check.ts";

const workspaceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
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

const main = async (): Promise<void> => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "tenet-drift-demo-"));

  try {
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

    process.exitCode = await runCheckCommand({ repositoryPath: repositoryRoot });
  } finally {
    await rm(repositoryRoot, { recursive: true, force: true });
  }
};

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 2;
});
