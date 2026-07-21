# Tenet Build Log

OpenAI Build Week

## Objective

Build an intent-aware developer control plane using Codex as the primary implementation agent.

This log records the actual development process and must not contain fabricated statistics.

---

## Development Timeline

### Project initialization

- Repository created.
- Product architecture defined.
- AGENTS.md created.
- PRODUCT.md created.

### Foundation initialization — 2026-07-21

- Created the npm workspace foundation for the Next.js control plane, shared
  contracts, validation engine, CLI, and ecommerce demo repository.
- Added strict TypeScript, ESLint, Vitest, root verification scripts, environment
  documentation, and Git ignore rules for secrets and generated artifacts.
- Added the initial PostgreSQL/Drizzle schema for repositories, tenets,
  intended architecture, commits, validation runs, violations, tenet
  evaluations, and health snapshots.
- Generated the initial Drizzle PostgreSQL migration from that schema.
- Added a clean ecommerce baseline plus isolated source overlays for the
  architectural-drift and semantic-conflict scenarios.
- Added a server-only GPT-5.6 Responses API adapter for structured Tenet
  proposals and deterministic-evidence explanations. It requires a configured
  API key and is not in the validation enforcement path.

---

## Codex Contributions

- Initialized the monorepo and its executable quality gates.
- Added deterministic health-calculation utilities and initial unit tests.
- Added the CLI package and its intentionally narrow P0 command surface.
- Added the control-plane foundation and a non-dashboard health endpoint.

---

## Architectural Decisions

- npm workspaces are used instead of Turborepo or Nx to minimize bootstrap and
  orchestration overhead.
- The control plane is a single Next.js application with API routes rather than
  a separate backend service.
- PostgreSQL with Drizzle is the persistence path; observed graph snapshots are
  stored as JSON per validation run rather than in a graph database.
- The engine owns deterministic health calculations and validation status. GPT
  services may propose a draft Tenet or explain supplied evidence, but cannot
  change PASS/WARN/BLOCK or activate a Tenet.
- The GPT adapter defaults to `gpt-5.6-terra` and uses Responses API structured
  output. It is server-only and remains dormant without `OPENAI_API_KEY`.

---

## Problems & Debugging

- Dependency installation required the approved unrestricted network path
  because the sandbox was limited to cached npm packages.
- The installed tsup version does not support the attempted `--banner.js` flag;
  the CLI entrypoint's existing shebang is used instead.
- Turbopack could not resolve NodeNext `.js` source specifiers when the control
  plane imported engine source. The control plane now imports only shared AI
  interfaces from contracts, preserving the intended local-engine/hosted-app
  separation.
- Vitest and tsup require local child processes in this environment; verification
  commands were rerun through the approved process-execution path.

---

## Testing & Validation

- `npm install` completed successfully.
- `npm run lint` passed.
- `npm run typecheck` passed across all workspaces.
- `npm run test` passed: 2 test files and 5 tests covering structured-tenet
  confirmation, architecture-health deduplication, intent-health scoring, and
  blocking-status derivation.
- `npm run build` passed for contracts, engine, CLI, and the Next.js control
  plane.
- `npm run db:generate` completed and generated the initial migration.

---

## Architectural Drift Enforcement - 2026-07-21

- Implemented a local TypeScript repository analyzer with ts-morph. It loads
  the target `tsconfig.json`, analyzes `.ts`, `.tsx`, `.mts`, and `.cts` files,
  resolves local ESM imports and exports (including configured path aliases),
  and assigns files to configured module path roots.
- Added a normalized runtime dependency graph with source and target modules,
  resolved files, import specifiers, and source locations. Type-only imports
  are excluded. Dynamic and unresolved imports are retained as warnings rather
  than blocking graph edges.
- Implemented deterministic direct-dependency enforcement for the active
  Checkout Persistence Boundary Tenet. A `checkout -> database` edge produces
  one stable, blocking architecture violation, with the expected route,
  observed dependency, affected file, and import evidence.
- Connected analysis, architecture validation, health calculation, and status
  derivation to `tenet check`. The ecommerce fixture declares the intended
  `checkout -> gateway -> database` path and a safe temporary-overlay script
  demonstrates the direct database dependency scenario.
- Added real-fixture tests for compliant and drifting repositories, stable
  fingerprints, duplicate imports, type-only imports, path aliases,
  unresolved/dynamic imports, exact health deduction, and CLI exit behavior.

### Architectural decisions

- P0 architecture enforcement evaluates direct runtime dependencies only. One
  unique `checkout -> database` boundary violation deducts 5 Architecture
  Health points; repeated imports of the same edge do not compound the score.
- The local CLI does not require `DATABASE_URL`; persistence is intentionally
  deferred until the deterministic vertical slice is integrated with the
  control plane.

### Problems and debugging

- Workspace scripts run from the package directory. `tenet check --repo` now
  resolves relative paths from the original npm invocation directory so the
  root demo command targets `examples/ecommerce` correctly.
- The drift demo initially used top-level await under the repository's CommonJS
  root package configuration. It now uses an explicit async entry function and
  preserves the validator's intentional non-zero exit status.

### Verification

- `npm run lint` passed.
- `npm run typecheck` passed across all workspaces.
- `npm run test` passed: 4 test files and 14 tests.
- `npm run build` passed for contracts, engine, CLI, and the Next.js control
  plane.
- `npm run demo:architecture:compliant` returned exit code 0 with Architecture
  Health 100/100 and PASS.
- `npm run demo:architecture:drift` returned exit code 1 with Architecture
  Health 95/100, one blocking violation, and COMMIT BLOCKED.
