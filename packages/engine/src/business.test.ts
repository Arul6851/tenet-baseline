import { copyFile, cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import { runTenetCheck } from "./check.js";
import { defaultTenetConfigPath, loadTenetConfiguration } from "./config.js";

const workspaceRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const ecommerceFixture = join(workspaceRoot, "examples", "ecommerce");
const scenarioRoot = join(workspaceRoot, "fixtures", "demo-scenarios");
const temporaryRepositories: string[] = [];

const scenarioFiles: Record<string, readonly string[]> = {
  "semantic-baseline": [
    "src/pricing/discount-policy.ts",
    "src/loyalty/premium-loyalty-discount.ts",
  ],
  "semantic-holiday": ["src/pricing/discount-policy.ts"],
  "semantic-premium": ["src/loyalty/premium-loyalty-discount.ts"],
  "semantic-combined": [
    "src/pricing/discount-policy.ts",
    "src/loyalty/premium-loyalty-discount.ts",
  ],
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

const applyScenario = async (
  repositoryRoot: string,
  scenario: keyof typeof scenarioFiles,
): Promise<void> => {
  const files = scenarioFiles[scenario];
  if (!files) {
    throw new Error(`Unknown semantic fixture scenario: ${scenario}`);
  }

  for (const relativeFilePath of files) {
    await copyFile(
      join(scenarioRoot, scenario, relativeFilePath),
      join(repositoryRoot, relativeFilePath),
    );
  }
};

const createRepository = async (
  scenario: keyof typeof scenarioFiles,
): Promise<string> => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "tenet-business-"));
  temporaryRepositories.push(repositoryRoot);
  await cp(ecommerceFixture, repositoryRoot, { recursive: true });
  await writeStandaloneTsconfig(repositoryRoot);
  await applyScenario(repositoryRoot, scenario);
  return repositoryRoot;
};

const checkRepository = async (repositoryRoot: string) => {
  const configuration = await loadTenetConfiguration(
    defaultTenetConfigPath(repositoryRoot),
  );
  return runTenetCheck({ repositoryRoot, configuration });
};

const discountPolicyFile = (repositoryRoot: string): string =>
  join(repositoryRoot, "src", "pricing", "discount-policy.ts");

const premiumDiscountFile = (repositoryRoot: string): string =>
  join(repositoryRoot, "src", "loyalty", "premium-loyalty-discount.ts");

afterEach(async () => {
  await Promise.all(
    temporaryRepositories.splice(0).map((repositoryRoot) =>
      rm(repositoryRoot, { recursive: true, force: true }),
    ),
  );
});

describe("deterministic max combined discount validation", () => {
  it.each([
    ["baseline", "semantic-baseline"],
    ["Change A (holiday 20%)", "semantic-holiday"],
    ["Change B (premium loyalty 15%)", "semantic-premium"],
  ] as const)("passes the %s state", async (_label, scenario) => {
    const repositoryRoot = await createRepository(scenario);
    const result = await checkRepository(repositoryRoot);

    expect(result.status).toBe("PASS");
    expect(result.violations).toEqual([]);
    expect(result.architectureHealth).toEqual({ score: 100, deductions: [] });
    expect(result.intentHealth).toEqual({ score: 100, deductions: [] });
    expect(result.businessEvaluations).toEqual([
      expect.objectContaining({
        tenetId: "maximum-combined-customer-discount",
        status: "satisfied",
      }),
    ]);
  });

  it("blocks the combined state with exact deterministic discount evidence", async () => {
    const repositoryRoot = await createRepository("semantic-combined");
    const result = await checkRepository(repositoryRoot);
    const violation = result.violations.find(
      (candidate) => candidate.type === "semantic",
    );

    expect(result.status).toBe("BLOCK");
    expect(result.architectureHealth).toEqual({ score: 100, deductions: [] });
    expect(result.intentHealth).toEqual({
      score: 0,
      deductions: [
        expect.objectContaining({
          key: "maximum-combined-customer-discount",
          label: "Tenet is violated",
          amount: 100,
        }),
      ],
    });
    expect(violation).toMatchObject({
      fingerprint:
        "semantic:maximum-combined-customer-discount:max_combined_discount:customer",
      type: "semantic",
      severity: "critical",
      enforcement: "block_merge",
      status: "blocked",
      affectedFiles: [
        "src/loyalty/premium-loyalty-discount.ts",
        "src/pricing/discount-policy.ts",
      ],
      semantic: {
        kind: "max_combined_discount",
        stackGroup: "customer",
        maximumPercent: 30,
        potentialPercent: 35,
      },
    });
    expect(violation?.semantic?.contributingDiscounts).toEqual([
      expect.objectContaining({
        id: "holiday-discount",
        percent: 20,
        sourceFile: "src/pricing/discount-policy.ts",
      }),
      expect.objectContaining({
        id: "premium-loyalty-discount",
        percent: 15,
        sourceFile: "src/loyalty/premium-loyalty-discount.ts",
      }),
    ]);
    expect(violation?.evidence).toEqual([
      expect.objectContaining({
        kind: "discount",
        file: "src/pricing/discount-policy.ts",
      }),
      expect.objectContaining({
        kind: "discount",
        file: "src/loyalty/premium-loyalty-discount.ts",
      }),
    ]);
  });

  it("keeps the semantic violation fingerprint stable across repeated analysis", async () => {
    const repositoryRoot = await createRepository("semantic-combined");
    const firstResult = await checkRepository(repositoryRoot);
    const secondResult = await checkRepository(repositoryRoot);

    expect(firstResult.violations[0]?.fingerprint).toBe(
      secondResult.violations[0]?.fingerprint,
    );
  });

  it("deduplicates identical declarations before calculating the potential", async () => {
    const repositoryRoot = await createRepository("semantic-combined");
    const policyFile = discountPolicyFile(repositoryRoot);
    await writeFile(
      policyFile,
      `${await readFile(policyFile, "utf8")}\nexport const repeatedHolidayDiscount = defineDiscount({\n  id: "holiday-discount",\n  name: "holidayDiscount",\n  percent: 20,\n  stackGroup: "customer",\n  combinable: true,\n});\n`,
    );

    const result = await checkRepository(repositoryRoot);
    const violation = result.violations.find(
      (candidate) => candidate.type === "semantic",
    );

    expect(violation?.semantic?.potentialPercent).toBe(35);
    expect(violation?.semantic?.contributingDiscounts).toHaveLength(2);
    expect(result.analysis.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "duplicate_discount_declaration" }),
      ]),
    );
  });

  it("does not stack a non-combinable discount", async () => {
    const repositoryRoot = await createRepository("semantic-combined");
    const policyFile = discountPolicyFile(repositoryRoot);
    await writeFile(
      policyFile,
      (await readFile(policyFile, "utf8")).replace(
        "combinable: true,",
        "combinable: false,",
      ),
    );

    const result = await checkRepository(repositoryRoot);

    expect(result.status).toBe("PASS");
    expect(result.intentHealth).toEqual({ score: 100, deductions: [] });
  });

  it("does not stack a discount in a different stack group", async () => {
    const repositoryRoot = await createRepository("semantic-combined");
    const loyaltyFile = premiumDiscountFile(repositoryRoot);
    await writeFile(
      loyaltyFile,
      (await readFile(loyaltyFile, "utf8")).replace(
        'stackGroup: "customer",',
        'stackGroup: "partner",',
      ),
    );

    const result = await checkRepository(repositoryRoot);

    expect(result.status).toBe("PASS");
    expect(result.intentHealth).toEqual({ score: 100, deductions: [] });
  });

  it("warns for a dynamically computed percentage without creating a block", async () => {
    const repositoryRoot = await createRepository("semantic-combined");
    const policyFile = discountPolicyFile(repositoryRoot);
    await writeFile(
      policyFile,
      `const configuredHolidayPercent = 20;\n${(
        await readFile(policyFile, "utf8")
      ).replace("percent: 20,", "percent: configuredHolidayPercent,")}`,
    );

    const result = await checkRepository(repositoryRoot);

    expect(result.status).toBe("PASS");
    expect(result.intentHealth).toEqual({ score: 100, deductions: [] });
    expect(result.analysis.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "unsupported_discount_declaration",
          file: "src/pricing/discount-policy.ts",
        }),
      ]),
    );
  });
});
