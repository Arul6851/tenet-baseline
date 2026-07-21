#!/usr/bin/env node

import { resolve } from "node:path";

import { Command } from "commander";

import { runCheckCommand } from "./check.js";
import { runConnectCommand } from "./control-plane.js";

const foundationNotice = (command: string): void => {
  console.log(
    `tenet ${command} is reserved for a later workflow. Use tenet check for the available deterministic validation path.`,
  );
};

const program = new Command();

program
  .name("tenet")
  .description("Intent-aware engineering validation for TypeScript repositories")
  .version("0.1.0");

program
  .command("init")
  .description("Create a Tenet configuration for the current repository")
  .action(() => foundationNotice("init"));

program
  .command("connect")
  .description("Connect a repository to the Tenet control plane")
  .requiredOption("--url, --control-plane-url <url>", "Control-plane base URL")
  .requiredOption("--repository <slug>", "Control-plane repository slug")
  .option("--token <token>", "Optional control-plane bearer token")
  .option("--repo <path>", "Repository root to connect", ".")
  .action(
    async (options: {
      url: string;
      repository: string;
      token?: string;
      repo: string;
    }) => {
      const invocationDirectory = process.env.INIT_CWD ?? process.cwd();
      const exitCode = await runConnectCommand({
        repositoryPath: resolve(invocationDirectory, options.repo),
        controlPlaneUrl: options.url,
        repositorySlug: options.repository,
        ...(options.token === undefined ? {} : { token: options.token }),
      });
      process.exitCode = exitCode;
    },
  );

program
  .command("check")
  .description("Run local validation and optionally synchronize the result")
  .option("--repo <path>", "Repository root to validate", ".")
  .option("--config <path>", "Path to a Tenet configuration file")
  .action(async (options: { repo: string; config?: string }) => {
    const exitCode = await runCheckCommand({
      repositoryPath: options.repo,
      ...(options.config === undefined ? {} : { configPath: options.config }),
    });
    process.exitCode = exitCode;
  });

program
  .command("validate")
  .description("Validate a candidate revision and persist the result")
  .option("--base <ref>", "Git base revision")
  .action(() => foundationNotice("validate"));

program
  .command("status")
  .description("Show Tenet connection and validation status")
  .action(() => foundationNotice("status"));

void program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unexpected CLI error";
  console.error(`tenet: ${message}`);
  process.exitCode = 1;
});
