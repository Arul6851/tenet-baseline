import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";

import {
  controlPlaneUrlFromCliOptions,
  controlPlaneConfigPath,
  loadControlPlaneConnectionConfig,
  runConnectCommand,
} from "./control-plane.js";

const temporaryDirectories: string[] = [];

const createRepository = async (): Promise<string> => {
  const repositoryRoot = await mkdtemp(join(tmpdir(), "tenet-connect-"));
  temporaryDirectories.push(repositoryRoot);
  return repositoryRoot;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("tenet connect", () => {
  it("maps the --url alias to Commander's controlPlaneUrl option", () => {
    const command = new Command()
      .requiredOption("--url, --control-plane-url <url>", "Control-plane base URL")
      .requiredOption("--repository <slug>", "Control-plane repository slug");

    command.parse([
      "node",
      "tenet",
      "--url",
      "http://localhost:3000",
      "--repository",
      "commerce-platform",
    ]);

    expect(controlPlaneUrlFromCliOptions(command.opts())).toBe(
      "http://localhost:3000",
    );
  });

  it("writes an ignored local control-plane connection configuration", async () => {
    const repositoryRoot = await createRepository();
    const lines: string[] = [];
    const errors: string[] = [];

    const exitCode = await runConnectCommand(
      {
        repositoryPath: repositoryRoot,
        controlPlaneUrl: "http://localhost:3000/",
        repositorySlug: "acme/commerce-platform",
        token: "local-demo-token",
      },
      {
        log: (message) => lines.push(message),
        error: (message) => errors.push(message),
      },
    );

    const configuration = await loadControlPlaneConnectionConfig(repositoryRoot);
    const ignoredEntries = await readFile(
      join(repositoryRoot, ".tenet", ".gitignore"),
      "utf8",
    );

    expect(exitCode).toBe(0);
    expect(errors).toEqual([]);
    expect(lines.join("\n")).toContain("Connected acme/commerce-platform");
    expect(configuration).toEqual({
      version: 1,
      controlPlaneUrl: "http://localhost:3000",
      repositorySlug: "acme/commerce-platform",
      token: "local-demo-token",
    });
    expect(ignoredEntries).toContain("control-plane.json");
    await expect(readFile(controlPlaneConfigPath(repositoryRoot), "utf8")).resolves.toContain(
      "local-demo-token",
    );
  });

  it("rejects an invalid control-plane URL without writing a connection", async () => {
    const repositoryRoot = await createRepository();
    const errors: string[] = [];

    const exitCode = await runConnectCommand(
      {
        repositoryPath: repositoryRoot,
        controlPlaneUrl: "not a URL",
        repositorySlug: "acme/commerce-platform",
      },
      {
        log: () => undefined,
        error: (message) => errors.push(message),
      },
    );

    expect(exitCode).toBe(2);
    expect(errors.join("\n")).toContain("must be an http(s) URL");
    await expect(loadControlPlaneConnectionConfig(repositoryRoot)).resolves.toBeUndefined();
  });
});
