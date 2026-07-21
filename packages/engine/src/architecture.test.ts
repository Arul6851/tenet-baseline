import {
  copyFile,
  cp,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { defaultTenetConfigPath, loadTenetConfiguration } from "./config.js";
import { runArchitectureCheck } from "./check.js";

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
const temporaryRepositories: string[] = [];

const createRepository = async (): Promise<string> => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "tenet-architecture-"));
  temporaryRepositories.push(repositoryRoot);
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
  return repositoryRoot;
};

const checkRepository = async (repositoryRoot: string) => {
  const configuration = await loadTenetConfiguration(
    defaultTenetConfigPath(repositoryRoot),
  );
  return runArchitectureCheck({ repositoryRoot, configuration });
};

const checkoutFile = (repositoryRoot: string): string =>
  join(repositoryRoot, "src", "checkout", "checkout-service.ts");

afterEach(async () => {
  await Promise.all(
    temporaryRepositories.splice(0).map((repositoryRoot) =>
      rm(repositoryRoot, { recursive: true, force: true }),
    ),
  );
});

describe("ts-morph architecture enforcement", () => {
  it("accepts Checkout -> Gateway -> Database and keeps health at 100", async () => {
    const repositoryRoot = await createRepository();
    const result = await checkRepository(repositoryRoot);

    expect(result.status).toBe("PASS");
    expect(result.architectureHealth).toEqual({ score: 100, deductions: [] });
    expect(result.violations).toEqual([]);
    expect(result.analysis.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceModule: "checkout",
          targetModule: "gateway",
          sourceFile: "src/checkout/checkout-service.ts",
          targetFile: "src/gateway/database-gateway.ts",
        }),
        expect.objectContaining({
          sourceModule: "gateway",
          targetModule: "database",
        }),
      ]),
    );
  });

  it("blocks a direct Checkout -> Database dependency with exact evidence", async () => {
    const repositoryRoot = await createRepository();
    await copyFile(driftOverlay, checkoutFile(repositoryRoot));

    const result = await checkRepository(repositoryRoot);
    const [violation] = result.violations;

    expect(result.status).toBe("BLOCK");
    expect(result.architectureHealth.score).toBe(95);
    expect(violation).toMatchObject({
      fingerprint: "architecture:checkout-persistence-boundary:checkout->database",
      type: "architecture",
      severity: "critical",
      status: "blocked",
      affectedFiles: ["src/checkout/checkout-service.ts"],
      architecture: {
        sourceModule: "checkout",
        targetModule: "database",
        expectedRoute: ["checkout", "gateway", "database"],
        actualDependency: {
          sourceModule: "checkout",
          targetModule: "database",
        },
      },
    });
    expect(violation?.evidence).toEqual([
      expect.objectContaining({
        kind: "import",
        file: "src/checkout/checkout-service.ts",
        line: 1,
        excerpt: 'import "../database/raw-database-client.js"',
      }),
    ]);
  });

  it("keeps the violation fingerprint stable across repeated analysis", async () => {
    const repositoryRoot = await createRepository();
    await copyFile(driftOverlay, checkoutFile(repositoryRoot));

    const firstResult = await checkRepository(repositoryRoot);
    const secondResult = await checkRepository(repositoryRoot);

    expect(firstResult.violations[0]?.fingerprint).toBe(
      secondResult.violations[0]?.fingerprint,
    );
  });

  it("does not double-deduct health for duplicate imports of the same edge", async () => {
    const repositoryRoot = await createRepository();
    await copyFile(driftOverlay, checkoutFile(repositoryRoot));
    await writeFile(
      checkoutFile(repositoryRoot),
      `${await readFile(checkoutFile(repositoryRoot), "utf8")}\nimport { RawDatabaseClient as DuplicateRawDatabaseClient } from "../database/raw-database-client.js";\nvoid DuplicateRawDatabaseClient;\n`,
    );

    const result = await checkRepository(repositoryRoot);
    const directEdges = result.analysis.edges.filter(
      (edge) =>
        edge.sourceModule === "checkout" && edge.targetModule === "database",
    );

    expect(directEdges).toHaveLength(2);
    expect(result.violations).toHaveLength(1);
    expect(result.architectureHealth).toMatchObject({ score: 95 });
    expect(result.architectureHealth.deductions).toHaveLength(1);
  });

  it("ignores type-only database imports for runtime architecture validation", async () => {
    const repositoryRoot = await createRepository();
    await writeFile(
      checkoutFile(repositoryRoot),
      `${await readFile(checkoutFile(repositoryRoot), "utf8")}\nimport type { PersistedCheckout } from "../database/raw-database-client.js";\nexport type CheckoutPersistence = PersistedCheckout;\n`,
    );

    const result = await checkRepository(repositoryRoot);

    expect(result.status).toBe("PASS");
    expect(
      result.analysis.edges.some(
        (edge) =>
          edge.sourceModule === "checkout" && edge.targetModule === "database",
      ),
    ).toBe(false);
  });

  it("resolves TypeScript path aliases through the repository tsconfig", async () => {
    const repositoryRoot = await createRepository();
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
            baseUrl: ".",
            paths: { "@gateway/*": ["src/gateway/*"] },
          },
          include: ["src/**/*.ts"],
        },
        null,
        2,
      )}\n`,
    );
    await writeFile(
      checkoutFile(repositoryRoot),
      `import { DatabaseGateway } from "@gateway/database-gateway";\n\nexport class CheckoutService {\n  public constructor(private readonly gateway = new DatabaseGateway()) {}\n}\n`,
    );

    const result = await checkRepository(repositoryRoot);

    expect(result.status).toBe("PASS");
    expect(result.analysis.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourceModule: "checkout",
          targetModule: "gateway",
          importSpecifier: "@gateway/database-gateway",
        }),
      ]),
    );
  });

  it("warns for unresolved and dynamic imports without creating a block", async () => {
    const repositoryRoot = await createRepository();
    await writeFile(
      checkoutFile(repositoryRoot),
      `${await readFile(checkoutFile(repositoryRoot), "utf8")}\nimport "../database/not-present.js";\nconst runtimeTarget = "../database/raw-database-client.js";\nvoid import(runtimeTarget);\n`,
    );

    const result = await checkRepository(repositoryRoot);

    expect(result.status).toBe("PASS");
    expect(result.analysis.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "unresolved_import",
          importSpecifier: "../database/not-present.js",
        }),
        expect.objectContaining({ kind: "dynamic_import" }),
      ]),
    );
  });
});
