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

---

## Control Plane Persistence - 2026-07-21

- Added a shared, strict Zod contract for completed deterministic validation
  runs. It carries repository identity, source and Git metadata, scores and
  deductions, warnings, evaluated Tenets, violations, and the normalized
  dependency graph snapshot.
- Extended the Drizzle PostgreSQL schema with stable repository display names,
  repository-scoped Tenet external IDs, validation-run idempotency keys,
  validation metadata, exact scores, warnings, and validation timestamps.
- Added a logical violation lifecycle keyed by repository plus deterministic
  fingerprint. A separate `validation_run_violations` table preserves the
  evidence observed in each run without duplicating logical violations.
- Implemented transactional persistence that bootstraps a repository and its
  configured Tenets and intended architecture on first synchronization,
  persists the deterministic result, then resolves active fingerprints absent
  from a later completed run.
- Added one health snapshot per validation run. The snapshot uses the local
  validation completion time rather than control-plane ingestion time so later
  health history remains chronologically meaningful.
- Added `POST /api/validation-runs` plus repository-scoped read APIs for a
  repository summary, validation runs, violations, health history, and Tenets.
- Added `tenet connect` and optional post-validation CLI synchronization. The
  local result is printed before synchronization; absent configuration,
  network errors, and control-plane errors remain non-blocking telemetry
  failures that do not change the CLI exit code.
- Added best-effort Git metadata and changed-file collection for synchronized
  runs. Repositories without Git metadata still synchronize valid local
  results.
- Added a disposable control-plane history runner. When a fresh database and
  running control plane are configured, it executes five real CLI/API scenarios
  and verifies the persisted read APIs rather than seeding history.
- Generated the second Drizzle migration for the persistence schema.

### Architectural decisions

- The API stores evidence generated by deterministic validators; it does not
  use GPT or recalculate PASS, WARN, BLOCK, Architecture Health, or Intent
  Health.
- Reposting the same payload with its client-generated UUID idempotency key
  returns the existing validation run. The key is request-level idempotency;
  the CLI does not yet provide a durable retry outbox.
- P0 bootstrap is automatic on the first successful real validation sync. It
  creates the demo repository and active Tenets but does not insert fake
  validation history.
- The P0 migration refuses a populated pre-persistence database. This is
  intentional: no historic score, enforcement value, or idempotency key is
  inferred for legacy rows.
- Drizzle and Next.js both explicitly load the repository-root `.env` for
  local development, matching the documented setup command.

### Problems and debugging

- The environment has running local PostgreSQL services, but no usable
  `DATABASE_URL` credential was available. The migration command now fails
  clearly before attempting a connection when that setting is absent.
- Vitest and Drizzle's generator could not spawn their esbuild helper inside
  the restricted sandbox. They were rerun through the approved normal
  child-process path.
- A new health snapshot projection initially exposed a strict TypeScript
  readonly-array mismatch with Drizzle's insert type; the persisted projection
  now uses mutable JSON arrays.
- The real ts-morph fixture tests occasionally exceeded Vitest's default
  five-second timeout under parallel load. The suite timeout is now fifteen
  seconds so those real analyses remain deterministic and reliable.
- A repeated Next.js production build encountered a Windows lock on the
  generated `.next` directory. The verified generated artifact was removed and
  the clean production build then passed.

### Verification

- `npm run db:generate` completed and generated
  `0001_complex_power_pack.sql`.
- `npm run db:migrate` correctly stopped before connection when `DATABASE_URL`
  was absent.
- `npm run lint` passed.
- `npm run typecheck` passed across all workspaces.
- `npm run test` passed: 10 test files and 45 tests. The suite includes
  ingestion contract validation, API acceptance and rejection paths,
  idempotency response behavior, read API availability behavior, lifecycle
  transitions, exact health/evidence persistence projections, and local CLI
  synchronization success and failure behavior.
- `npm run build` passed for contracts, engine, CLI, and the Next.js control
  plane.
- `npm run demo:architecture:compliant` returned exit code 0 with Architecture
  100/100, Intent 100/100, and PASS.
- `npm run demo:architecture:drift` returned exit code 1 with Architecture
  95/100, Intent 100/100, and a blocking direct dependency violation.
- `npm run demo:semantic:conflict` returned exit code 1 after baseline, Change
  A, and Change B each passed at 100/100; the combined state blocked with
  Architecture 100/100, Intent 0/100, and a proven 35% potential discount.
- No real PostgreSQL ingestion or persisted history run was executed because a
  valid `DATABASE_URL` was not available in the environment.
- `npm run demo:control-plane:history` was exercised without its required
  control-plane URL and stopped before creating temporary scenarios, with a
  clear configuration error.
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

---

## Semantic Conflict Enforcement - 2026-07-21

- Extended the ts-morph analysis pass to extract deterministic discount facts
  from direct `defineDiscount({ ... })` calls with literal `id`, `percent`,
  `stackGroup`, and `combinable` fields. Extracted facts include source file,
  location, module ownership when available, and a compact source excerpt.
- Added non-blocking analysis warnings for unsupported dynamic discount fields
  and duplicate declarations. Unsupported or conflicting declarations are
  deliberately excluded from blocking calculations.
- Added the active `Maximum Combined Discount` business Tenet to the ecommerce
  fixture: customer discounts must be combinable and total at most 30%.
- Added the deterministic `BusinessInvariantValidator` extension point and the
  P0 `MaxCombinedDiscountValidator`. It sums only unambiguous, literal,
  combinable discounts in the configured stack group and emits a stable
  semantic violation when the proven total exceeds the configured maximum.
- Added typed semantic violation evidence containing the maximum, potential
  percentage, contributing declarations, affected files, Tenet metadata, and
  blocking status.
- Added `runTenetCheck`, which performs one source analysis then evaluates
  architecture and business Tenets separately. Architecture Health is still
  calculated only from architecture findings; Intent Health is calculated only
  from business-Tenet evaluations.
- Extended `tenet check` with separate Architecture and Intent Health output,
  Architecture Tenets and Business Tenets sections, and a semantic-conflict
  report. GPT is not in the enforcement or score-calculation path.
- Added safe semantic scenario overlays for baseline, Change A, Change B, and
  their combined state. The combined scenario modifies pricing and loyalty in
  separate files, demonstrating a no-textual-conflict state without mutating
  a Git checkout.
- Added `scripts/demo-semantic-conflict.ts`, which runs all four states in
  disposable repository copies and intentionally exits 1 for the combined
  blocking state.

### Problems and debugging

- Lint identified an unused duplicate-declaration grouping key in the new
  analyzer. The key was removed without changing the deterministic grouping
  behavior.
- Strict TypeScript identified an indexed scenario-fixture lookup as possibly
  undefined under `noUncheckedIndexedAccess`. The test helper now checks the
  scenario map entry before copying fixture files.

### Technical limitations

- P0 semantic enforcement recognizes only direct `defineDiscount` calls whose
  relevant fields are literals. Identifiers, arithmetic, spreads, conditionals,
  and runtime values produce warnings rather than inferred blocking evidence.
- The semantic demo proves two non-overlapping TypeScript source changes in
  disposable copies. It does not automate temporary Git branches or merges.
- This is a single explicit business invariant type, not a claim of arbitrary
  semantic program analysis.

### Verification

- Baseline (0% holiday + 0% premium) returned PASS with Architecture 100/100
  and Intent 100/100.
- Change A (20% holiday + 0% premium) returned PASS with Architecture 100/100
  and Intent 100/100.
- Change B (0% holiday + 15% premium) returned PASS with Architecture 100/100
  and Intent 100/100.
- Combined state (20% holiday + 15% premium) returned BLOCK with Architecture
  100/100, Intent 0/100, one semantic violation, a 30% maximum, and a proven
  35% potential discount.
- The approved compliant architecture scenario still returned PASS at
  Architecture 100/100 and Intent 100/100.
- The approved architecture-drift scenario still returned BLOCK at Architecture
  95/100 while Intent remained 100/100.
- `npm run lint` passed.
- `npm run typecheck` passed across all workspaces.
- `npm run test` passed: 5 test files and 25 tests.
- `npm run build` passed for contracts, engine, CLI, and the Next.js control
  plane.

---

## AWS RDS Persistence Verification - 2026-07-21

- Audited repository secret handling before connecting to the database. The
  root `.env` is ignored and untracked. A legacy local credential-style
  Drizzle fallback found during this review was replaced with a non-secret
  placeholder. The final tracked-source scan found no non-placeholder
  PostgreSQL connection strings or database credentials.
- Verified the configured AWS RDS PostgreSQL instance is available with the
  configured host and port. Direct PostgreSQL connectivity succeeded when TLS
  was required.
- Added RDS-aware connection-string normalization in the control plane and
  Drizzle configuration. For an `*.rds.amazonaws.com` host with no explicit
  SSL mode, Tenet uses `sslmode=require`; explicit SSL modes and non-RDS local
  PostgreSQL URLs remain unchanged.
- Applied the existing Drizzle migration against AWS RDS. The expected Tenet
  schema was then present with 11 application tables.
- Bootstrapped the real `commerce-platform` control-plane repository and its
  two active deterministic Tenets through normal validation ingestion, rather
  than manually inserting demo history.
- Extended the persisted-history demo to capture real CLI synchronization
  contexts and their original validated payloads, verify exact database-backed
  read API results, verify graph and lifecycle evidence, repeat the exact
  completed payload with the same idempotency key, and support `--resume` when
  a prior real first run has already committed.
- Added a CLI synchronization retry test and increased the post-validation
  telemetry timeout from five to fifteen seconds. A single retry is attempted
  only for transient delivery/abort errors and reuses the same idempotency key
  and serialized deterministic payload. Local PASS/BLOCK status remains
  authoritative regardless of synchronization outcome.
- Added unit coverage for automatic RDS TLS handling while preserving explicit
  SSL configuration and local PostgreSQL behavior.

### Real persistence results

- `/api/health` and all repository read APIs returned successful responses
  from the running control plane backed by AWS RDS.
- The real persisted history contains exactly five validation runs and five
  health snapshots with no duplicate ingestion keys:
  - Run 1: PASS, Architecture 100, Intent 100.
  - Run 2: BLOCK, Architecture 95, Intent 100, with the Checkout-to-Database
    architectural drift violation.
  - Run 3: PASS, Architecture 100, Intent 100; the architectural violation
    transitioned to resolved.
  - Run 4: BLOCK, Architecture 100, Intent 0, with the deterministic 35%
    combined-discount semantic violation against the 30% maximum.
  - Run 5: PASS, Architecture 100, Intent 100; the semantic violation
    transitioned to resolved.
- Direct read-only PostgreSQL verification confirmed the exact Architecture
  Health history `100, 95, 100, 100, 100` and Intent Health history
  `100, 100, 100, 0, 100`. The values were persisted directly from engine
  results, not recalculated in the API or database.
- PostgreSQL contains one logical architectural violation and one logical
  semantic violation. Both retain stable fingerprints, first/last seen values,
  resolution timestamps, and deterministic evidence. The architectural record
  retains Checkout-to-Database import evidence; the semantic record retains
  the 30% maximum, 35% potential, and both discount declarations.
- The architectural-drift run stores both intended
  Checkout-to-Gateway-to-Database edges and the actual unauthorized
  Checkout-to-Database graph edge in its JSON snapshot.
- Re-submitting an already-persisted completed validation with the same client
  idempotency key returned the existing logical run. Validation-run, health
  snapshot, logical-violation, and graph-snapshot counts remained unchanged.
  The demo now preserves the original validated payload for exact replay in a
  future fresh history run.

### Problems and debugging

- The first real ingestion committed to PostgreSQL just after the CLI's
  original five-second telemetry timeout. The local compliant result remained
  correct, but the caller did not receive the receipt. This exposed a real
  post-commit delivery case, not a deterministic-validation failure. The
  longer timeout and same-key transient-delivery retry fix the client path;
  the existing database uniqueness constraint keeps retries idempotent.
- A read-only verification query initially multiplied row counts through a
  diagnostic join. It was replaced with independent scalar counts before
  recording results; direct PostgreSQL verification confirms five logical
  validation runs rather than the multiplied diagnostic count.
- The RDS endpoint required TLS. This was resolved in application and Drizzle
  configuration without changing the PostgreSQL/Drizzle architecture.

### Verification

- `npm run db:migrate` completed successfully against AWS RDS.
- `npm run demo:control-plane:history -- --resume` completed successfully
  through real deterministic validation, the local HTTP API, and PostgreSQL.
- The live read APIs returned a repository summary with no active violations,
  five validation runs, two resolved logical violations, five health
  snapshots, two active Tenets, and the persisted unauthorized graph edge.
- A fresh compiled `next start` control plane process returned `/api/health`
  and the repository summary successfully from AWS RDS, with final
  Architecture and Intent Health both at 100 and no active violations.
- `npm run demo:architecture:compliant` returned PASS at Architecture 100/100
  and Intent 100/100.
- `npm run demo:architecture:drift` returned the expected non-zero blocking
  result at Architecture 95/100 and Intent 100/100.
- `npm run demo:semantic:conflict` returned PASS for baseline, Change A, and
  Change B, then the expected non-zero combined-state BLOCK at Architecture
  100/100, Intent 0/100, and 35% over the 30% maximum.
- `npm run lint` passed.
- `npm run typecheck` passed across all workspaces.
- `npm run test` passed: 11 test files and 48 tests.
- `npm run build` passed for contracts, engine, CLI, and the Next.js control
  plane.
