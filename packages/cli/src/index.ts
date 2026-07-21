#!/usr/bin/env node

import { Command } from "commander";

import { runCheckCommand } from "./check.js";

const foundationNotice = (command: string): void => {
  console.log(
    `tenet ${command} is wired into the foundation. Deterministic repository validation is the next implementation phase.`,
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
  .action(() => foundationNotice("connect"));

program
  .command("check")
  .description("Run a local, non-persisted validation")
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
