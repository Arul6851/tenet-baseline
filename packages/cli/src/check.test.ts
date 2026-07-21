import { copyFile, cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ValidationRunIngestionSchema } from "@tenet/contracts";

import { runCheckCommand, type TerminalOutput } from "./check.js";
import {
  createValidationSyncPayload,
  writeControlPlaneConnectionConfig,
  type ValidationRunSynchronizer,
} from "./control-plane.js";

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
const semanticCombinedOverlays = [
  "src/pricing/discount-policy.ts",
  "src/loyalty/premium-loyalty-discount.ts",
] as const;
const semanticScenarioRoot = join(
  workspaceRoot,
  "fixtures",
  "demo-scenarios",
  "semantic-combined",
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

const createCompliantRepository = async (): Promise<string> => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "tenet-cli-compliant-"));
  temporaryDirectories.push(repositoryRoot);
  await cp(ecommerceFixture, repositoryRoot, { recursive: true });
  await writeStandaloneTsconfig(repositoryRoot);
  return repositoryRoot;
};

const createDriftRepository = async (): Promise<string> => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "tenet-cli-drift-"));
  temporaryDirectories.push(repositoryRoot);
  await cp(ecommerceFixture, repositoryRoot, { recursive: true });
  await writeStandaloneTsconfig(repositoryRoot);
  await copyFile(
    driftOverlay,
    join(repositoryRoot, "src", "checkout", "checkout-service.ts"),
  );
  return repositoryRoot;
};

const createSemanticConflictRepository = async (): Promise<string> => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "tenet-cli-semantic-"));
  temporaryDirectories.push(repositoryRoot);
  await cp(ecommerceFixture, repositoryRoot, { recursive: true });
  await writeStandaloneTsconfig(repositoryRoot);

  await Promise.all(
    semanticCombinedOverlays.map((relativeFilePath) =>
      copyFile(
        join(semanticScenarioRoot, relativeFilePath),
        join(repositoryRoot, relativeFilePath),
      ),
    ),
  );

  return repositoryRoot;
};

afterEach(async () => {
  vi.unstubAllGlobals();
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
    expect(terminal.lines.join("\n")).toContain("Intent             100/100");
    expect(terminal.lines).toContain("Business Tenets");
    expect(terminal.lines).toContain("PASS");
    expect(terminal.lines).toContain("- Not configured (local validation only).");
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

  it("prints a semantic conflict and returns non-zero for the merged discount state", async () => {
    const repositoryRoot = await createSemanticConflictRepository();
    const terminal = createCapturedTerminal();

    const exitCode = await runCheckCommand(
      { repositoryPath: repositoryRoot },
      terminal.output,
    );

    const output = terminal.lines.join("\n");
    expect(exitCode).toBe(1);
    expect(terminal.errors).toEqual([]);
    expect(output).toContain("Architecture       100/100");
    expect(output).toContain("Intent             0/100");
    expect(terminal.lines).toContain("SEMANTIC CONFLICT");
    expect(output).toContain("Maximum allowed:");
    expect(output).toContain("35%");
    expect(terminal.lines).toContain("CHANGE BLOCKED");
  });

  it("synchronizes a compliant local result after rendering PASS", async () => {
    const repositoryRoot = await createCompliantRepository();
    await writeControlPlaneConnectionConfig(repositoryRoot, {
      controlPlaneUrl: "http://localhost:3000",
      repositorySlug: "acme/commerce-platform",
    });
    const terminal = createCapturedTerminal();
    let synchronizedStatus: string | undefined;
    const synchronizer: ValidationRunSynchronizer = async ({ connection, result }) => {
      synchronizedStatus = result.status;
      expect(connection.repositorySlug).toBe("acme/commerce-platform");
      return { validationRunId: "validation-pass" };
    };

    const exitCode = await runCheckCommand(
      { repositoryPath: repositoryRoot, synchronizer },
      terminal.output,
    );
    const output = terminal.lines.join("\n");

    expect(exitCode).toBe(0);
    expect(synchronizedStatus).toBe("PASS");
    expect(output).toContain("✓ Validation synchronized (validation-pass)");
    expect(output.indexOf("PASS")).toBeLessThan(output.indexOf("Control plane:"));
  });

  it("posts the validated ingestion payload through the configured control plane", async () => {
    const repositoryRoot = await createCompliantRepository();
    await writeControlPlaneConnectionConfig(repositoryRoot, {
      controlPlaneUrl: "http://localhost:3000",
      repositorySlug: "acme/commerce-platform",
      token: "demo-token",
    });
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      async (input: string | URL | Request, init?: RequestInit) => {
        requests.push({
          url: input.toString(),
          ...(init === undefined ? {} : { init }),
        });
        return new Response(
          JSON.stringify({
            validationRunId: "9e71f179-5807-4e3f-8ddd-7e6d6c8db16d",
            created: true,
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      },
    );
    const terminal = createCapturedTerminal();

    const exitCode = await runCheckCommand(
      { repositoryPath: repositoryRoot },
      terminal.output,
    );
    const [request] = requests;
    const body = JSON.parse(String(request?.init?.body)) as unknown;
    const payload = ValidationRunIngestionSchema.parse(body);

    expect(exitCode).toBe(0);
    expect(request?.url).toBe("http://localhost:3000/api/validation-runs");
    expect(request?.init?.headers).toMatchObject({
      authorization: "Bearer demo-token",
      "content-type": "application/json",
    });
    expect(payload.repository).toMatchObject({
      slug: "acme/commerce-platform",
      name: "commerce-platform",
      displayName: "acme/commerce-platform",
    });
    expect(payload.status).toBe("PASS");
    expect(payload.health.architecture.score).toBe(100);
    expect(payload.health.intent.score).toBe(100);
    expect(payload.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu,
    );
  });

  it("retries a transient delivery failure with the same validation payload", async () => {
    const repositoryRoot = await createCompliantRepository();
    await writeControlPlaneConnectionConfig(repositoryRoot, {
      controlPlaneUrl: "http://localhost:3000",
      repositorySlug: "acme/commerce-platform",
    });
    const requestBodies: string[] = [];
    let attempts = 0;
    vi.stubGlobal(
      "fetch",
      async (_input: string | URL | Request, init?: RequestInit) => {
        attempts += 1;
        requestBodies.push(String(init?.body));

        if (attempts === 1) {
          throw new TypeError("fetch failed");
        }

        return new Response(
          JSON.stringify({
            validationRunId: "bf550bf1-69c8-43db-8b30-d7866e7f3e39",
            created: false,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );
    const terminal = createCapturedTerminal();

    const exitCode = await runCheckCommand(
      { repositoryPath: repositoryRoot },
      terminal.output,
    );

    expect(exitCode).toBe(0);
    expect(attempts).toBe(2);
    expect(requestBodies[1]).toBe(requestBodies[0]);
    expect(ValidationRunIngestionSchema.parse(JSON.parse(requestBodies[0] ?? "{}")))
      .toMatchObject({ status: "PASS" });
    expect(terminal.lines.join("\n")).toContain(
      "Validation synchronized (bf550bf1-69c8-43db-8b30-d7866e7f3e39)",
    );
  });

  it("keeps a local PASS when control-plane synchronization is unavailable", async () => {
    const repositoryRoot = await createCompliantRepository();
    await writeControlPlaneConnectionConfig(repositoryRoot, {
      controlPlaneUrl: "http://localhost:3000",
      repositorySlug: "acme/commerce-platform",
    });
    const terminal = createCapturedTerminal();
    const synchronizer: ValidationRunSynchronizer = async () => {
      throw new Error("connection refused");
    };

    const exitCode = await runCheckCommand(
      { repositoryPath: repositoryRoot, synchronizer },
      terminal.output,
    );

    expect(exitCode).toBe(0);
    expect(terminal.lines).toContain(
      "! Synchronization unavailable: connection refused",
    );
    expect(terminal.lines).toContain("PASS");
  });

  it("keeps a local BLOCK when synchronization succeeds", async () => {
    const repositoryRoot = await createDriftRepository();
    await writeControlPlaneConnectionConfig(repositoryRoot, {
      controlPlaneUrl: "http://localhost:3000",
      repositorySlug: "acme/commerce-platform",
    });
    const terminal = createCapturedTerminal();
    let payload: Awaited<ReturnType<typeof createValidationSyncPayload>> | undefined;
    const synchronizer: ValidationRunSynchronizer = async (context) => {
      payload = await createValidationSyncPayload(context);
      return { validationRunId: "validation-block" };
    };

    const exitCode = await runCheckCommand(
      { repositoryPath: repositoryRoot, synchronizer },
      terminal.output,
    );

    expect(exitCode).toBe(1);
    expect(payload?.health).toMatchObject({
      architecture: { score: 95 },
      intent: { score: 100 },
    });
    expect(payload?.violations).toHaveLength(1);
    expect(payload?.violations[0]).toMatchObject({
      type: "architecture",
      architecture: {
        sourceModule: "checkout",
        targetModule: "database",
      },
    });
    expect(payload?.violations[0]?.evidence[0]).toMatchObject({
      kind: "import",
      file: "src/checkout/checkout-service.ts",
    });
    expect(terminal.lines).toContain("COMMIT BLOCKED");
    expect(terminal.lines).toContain("✓ Validation synchronized (validation-block)");
  });

  it("preserves deterministic semantic evidence in a blocking sync payload", async () => {
    const repositoryRoot = await createSemanticConflictRepository();
    await writeControlPlaneConnectionConfig(repositoryRoot, {
      controlPlaneUrl: "http://localhost:3000",
      repositorySlug: "acme/commerce-platform",
    });
    const terminal = createCapturedTerminal();
    let payload: Awaited<ReturnType<typeof createValidationSyncPayload>> | undefined;
    const synchronizer: ValidationRunSynchronizer = async (context) => {
      payload = await createValidationSyncPayload(context);
      return { validationRunId: "validation-semantic" };
    };

    const exitCode = await runCheckCommand(
      { repositoryPath: repositoryRoot, synchronizer },
      terminal.output,
    );

    expect(exitCode).toBe(1);
    expect(payload?.health).toMatchObject({
      architecture: { score: 100 },
      intent: { score: 0 },
    });
    expect(payload?.violations).toHaveLength(1);
    expect(payload?.violations[0]).toMatchObject({
      type: "semantic",
      semantic: {
        maximumPercent: 30,
        potentialPercent: 35,
        stackGroup: "customer",
      },
    });
    expect(payload?.violations[0]?.semantic?.contributingDiscounts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "holiday-discount", percent: 20 }),
        expect.objectContaining({ id: "premium-loyalty-discount", percent: 15 }),
      ]),
    );
  });

  it("keeps a local BLOCK when synchronization fails", async () => {
    const repositoryRoot = await createDriftRepository();
    await writeControlPlaneConnectionConfig(repositoryRoot, {
      controlPlaneUrl: "http://localhost:3000",
      repositorySlug: "acme/commerce-platform",
    });
    const terminal = createCapturedTerminal();
    const synchronizer: ValidationRunSynchronizer = async () => {
      throw new Error("control plane unavailable");
    };

    const exitCode = await runCheckCommand(
      { repositoryPath: repositoryRoot, synchronizer },
      terminal.output,
    );

    expect(exitCode).toBe(1);
    expect(terminal.lines).toContain("COMMIT BLOCKED");
    expect(terminal.lines).toContain(
      "! Synchronization unavailable: control plane unavailable",
    );
  });
});
