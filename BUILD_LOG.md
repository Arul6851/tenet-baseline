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

---

## Product Control Plane - 2026-07-21

- Replaced the control-plane foundation screen with a repository-scoped product
  shell for `acme/commerce-platform`. The desktop-first navigation includes
  Overview, Architecture, Tenets, Violations, Changes, and Analytics, plus
  repository identity and live control-plane status.
- Built the Overview from the persisted repository summary, health snapshots,
  validation history, and violation lifecycle APIs. It displays the real latest
  Architecture Health and Intent Health scores, compact history charts, recent
  validation activity, and resolved findings.
- Added a reusable client-safe dashboard data mapping layer with strict parsing
  for the five repository read APIs. It orders persisted health and validation
  data chronologically and maps lifecycle state for product views. Its focused
  tests cover health deltas, the five-run activity story, filters, and
  malformed API responses.
- Added an Architecture page that reads graph snapshots persisted with each
  validation run. It can inspect the historical blocking drift run and renders
  the declared Checkout-to-Gateway-to-Database route beside the actual graph,
  highlighting the deterministic Checkout-to-Database edge only when that
  architecture violation was recorded.
- Added Tenets, Violations, Changes, and Analytics product views driven by the
  repository APIs. They use persisted structured constraints, deterministic
  evidence, lifecycle timestamps, health scores, and validation outcomes; no
  second dashboard fixture dataset was added.
- Added the server-side GPT-5.6 workflow boundaries: a proposal route accepts
  natural-language intent and returns only a structured draft, a separate
  explicit confirmation route activates a control-plane Tenet, and an evidence
  explanation route loads the persisted deterministic violation server-side.
  Confirmation returns `localRepositorySyncRequired: true`; it does not alter
  local CLI enforcement or deterministic validator behavior.
- Added the visible New Tenet proposal/review/confirmation UI and an optional
  explanation action in violation detail. Both label the AI output as
  non-authoritative. The client rejects malformed response shapes before
  presenting them.
- Added loading, API-error, empty, focus, keyboard, status-label, tablet, and
  mobile states. The visual system uses CSS and SVG rather than adding a chart
  or graph dependency.

### Problems and debugging

- The initial Architecture-page edge classifier treated every direct runtime
  edge outside the narrow declared persistence route as drift. This incorrectly
  included the legitimate `loyalty -> pricing` edge. The UI now highlights an
  edge only when the selected historical validation is an architecture BLOCK
  and its persisted deterministic violation evidence names that exact edge.
- Headless Chrome stores extension files in its temporary profile. Local
  screenshot verification initially made ESLint traverse those generated files
  beneath `.tenet-demo`; that ignored local-tooling directory is now explicitly
  excluded from the lint configuration.
- The final secret audit found placeholder credentials in the Drizzle generate
  fallback URI. The fallback now uses a credential-free local URI; `.env`
  remains ignored and untracked.
- `OPENAI_API_KEY` is not configured in the current environment. The live
  proposal endpoint correctly returned `503 ai_unavailable`; no GPT proposal
  or explanation was simulated and no extra Tenet was persisted during UI
  verification.

### Verification

- A production `next start` control-plane process connected to the configured
  AWS RDS data and returned repository APIs with `acme/commerce-platform`, five
  validation runs, five health snapshots, two active Tenets, two resolved
  logical violations, zero active violations, and latest scores of Architecture
  100 and Intent 100.
- Browser screenshots were inspected for Overview, Architecture, Tenets,
  Violations, Changes, and Analytics at desktop width. The Architecture view
  displayed the persisted Run 2 BLOCK with Architecture Health 95 and the
  highlighted Checkout-to-Database dependency. Overview displayed the real
  Architecture sequence `100, 95, 100, 100, 100` and Intent sequence
  `100, 100, 100, 0, 100`.
- Tablet and mobile Overview screenshots were inspected for responsive layout,
  navigation, readable charts, and lack of material overflow.
- `npm run lint` passed after the local-browser artifact exclusion.
- `npm run typecheck` passed across the workspaces.
- `npm run test` passed with 17 test files and 70 tests, including the existing
  deterministic enforcement and persistence coverage plus new dashboard and
  GPT-boundary tests.
- `npm run build` passed for contracts, engine, CLI, and the Next.js control
  plane.

---

## Live GPT-5.6 Product Verification - 2026-07-21

- Verified live Responses API access with the configured `gpt-5.6-terra`
  model through the existing `OpenAiTenetService` boundary. The service remains
  proposal-and-explanation only; deterministic validators remain the sole
  source of PASS/WARN/BLOCK and health results.
- The first live Structured Outputs request exposed an API compatibility issue:
  the canonical Tenet proposal schema contains semantically optional fields,
  including architecture `expectedRoute`, while the Structured Outputs subset
  requires generated object fields to be required. A dedicated OpenAI output
  schema now contains only model-generated values, with every field required;
  the optional architecture intermediary is required-but-nullable at that
  boundary.
- Added a strict normalizer between the OpenAI boundary and the canonical
  deterministic Tenet domain contract. It maps a nullable
  `requiredIntermediary` to the canonical optional `expectedRoute` and derives
  a complete route from source, intermediary, and target. It then parses the
  result with the existing canonical schema. The server, rather than the model,
  supplies original intent, model identity, and the required human-confirmation
  flag.
- The first valid live architecture response also showed that asking the model
  for a complete route was ambiguous: it supplied only the intermediary. The
  output contract now asks for the single intermediary explicitly and derives
  the canonical route deterministically. This preserves strict validation
  rather than repairing an individual model result.
- A live Architecture proposal for “Checkout should never access the database
  directly. It must go through DatabaseGateway.” returned a draft Architecture
  Tenet with source `checkout`, target `database`, and canonical route
  `checkout -> gateway -> database`.
- A live Business proposal for the combined customer-discount cap returned a
  draft `max_combined_discount` Tenet with `maximumPercent: 30`, stack group
  `customer`, and `requireCombinable: true`.
- A live ambiguous request (“Make sure checkout stays clean and discounts don't
  get too high.”) returned a visible draft with assumptions. It did not create
  an active Tenet or alter deterministic enforcement, leaving the human able to
  inspect or reject the inferred policy.
- Browser verification exercised the actual New Tenet flow: natural-language
  input, the Interpreting loading state, real GPT proposal review, normalized
  structured constraint display, Cancel, and Confirm & Enforce controls. The
  duplicate Architecture proposal was cancelled after review and was not
  activated in the primary repository.
- Verified confirmation safely in an isolated control-plane repository. Its
  real GPT-generated Business proposal left the repository with zero Tenets
  before confirmation; an explicit `confirmed: true` request created one active
  Tenet with the validated deterministic discount constraint. The isolated
  repository, its one test Tenet, and its one synchronized validation run were
  then deleted after exact identity checks.
- Generated live GPT explanations from the persisted deterministic Semantic
  Conflict and Architectural Drift violations. The semantic explanation
  described the 20% and 15% discounts producing 35% against the 30% cap; the
  architecture explanation described the direct checkout-to-database bypass.
  Read-back verification confirmed that explanation generation changed neither
  validation runs, health snapshots, deterministic evidence, Tenet state, nor
  violation lifecycle.
- Rechecked primary demo-data integrity after live verification: the primary
  repository still has exactly the two canonical active Tenets, five validator
  generated runs (`PASS, BLOCK, PASS, BLOCK, PASS`), both resolved logical
  violations, five graph snapshots, Architecture Health history
  `100, 95, 100, 100, 100`, and Intent Health history
  `100, 100, 100, 0, 100`.
- Added ordinary non-live regression coverage for the OpenAI output boundary:
  Structured Outputs format creation, nullable-field normalization, valid
  Architecture and Business drafts, malformed/unsupported output rejection,
  strict explanation parsing, and server-owned draft metadata. Existing
  confirmation-route tests continue to prove that proposal generation cannot
  activate a Tenet without explicit confirmation.
- Rechecked secret handling before commit: `.env` is ignored and untracked,
  no credential-shaped values appear in tracked source or this verification
  change, and `.env.example` now uses credential-free placeholders.

### Verification

- `npm run lint` passed.
- `npm run typecheck` passed across all workspaces.
- `npm run test` passed: 19 test files and 78 tests.
- `npm run build` passed for contracts, engine, CLI, and the Next.js control
  plane.
- `npm run demo:architecture:compliant` returned PASS at Architecture 100/100
  and Intent 100/100; the drift demo retained its expected non-zero BLOCK at
  Architecture 95/100 and Intent 100/100.
- `npm run demo:semantic:conflict` retained PASS for baseline, Change A, and
  Change B, followed by its expected non-zero combined-state BLOCK at
  Architecture 100/100, Intent 0/100, and 35% over the 30% maximum.
