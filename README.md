# Tenet

## Your code still compiles. Your architecture doesn't.

Tenet is an intent-aware engineering control plane. It makes the architectural
boundaries and business invariants a team has already agreed to **enforceable**
as code changes.

Git understands what changed. Tests understand whether expected behavior
executes. Linters understand syntax and local rules. None of them necessarily
know whether the resulting system still respects the decisions the team made.

Tenet closes that gap with deterministic validation, evidence-backed health,
and a PostgreSQL-backed control plane.

> **AI interprets. Tenet enforces.**

## The two failure modes Tenet catches

### Architectural Drift

The declared persistence boundary is:

```text
Checkout → DatabaseGateway → Database
```

A change introduces a real direct TypeScript dependency:

```text
Checkout → Database
```

The code can compile and tests can still pass, but Checkout has bypassed the
declared persistence boundary. Tenet extracts the runtime dependency graph and
deterministically **BLOCKS** the direct edge.

### Semantic Conflict

Two separate, individually valid discount policies are non-overlapping source
changes that Git can merge cleanly:

```text
Holiday Discount       20%
Premium Loyalty        15%
                         ───
Combined customer discount 35%
Declared maximum            30%
```

There is no textual merge conflict. The conflict is between the resulting
system behavior and the declared business intent. Tenet deterministically
**BLOCKS** the 35% combined discount.

## What is a Tenet?

A **Tenet** is a structured, enforceable statement about what must remain true
as software changes. It carries a name, natural-language description, type,
scope, severity, enforcement mode, lifecycle status, and a machine-readable
constraint.

The P0 deterministic engine intentionally supports a focused policy vocabulary:

- **Architecture:** **forbid_direct_dependency** validates a direct runtime
  module edge against a declared boundary. The demo forbids
  **checkout → database** and records **checkout → gateway → database** as the
  expected route.
- **Business:** **max_combined_discount** sums statically provable,
  combinable **defineDiscount({...})** declarations in one stack group. The demo
  caps the **customer** group at 30%.

For example, the active demo Tenets are equivalent to:

```json
{
  "name": "Checkout Persistence Boundary",
  "type": "architecture",
  "severity": "critical",
  "enforcement": "block_merge",
  "constraint": {
    "kind": "forbid_direct_dependency",
    "sourceModule": "checkout",
    "targetModule": "database",
    "expectedRoute": ["checkout", "gateway", "database"]
  }
}
```

```json
{
  "name": "Maximum Combined Discount",
  "type": "business",
  "severity": "critical",
  "enforcement": "block_merge",
  "constraint": {
    "kind": "max_combined_discount",
    "maximumPercent": 30,
    "stackGroup": "customer",
    "requireCombinable": true
  }
}
```

Tenet does not claim arbitrary program-semantic reasoning. Unsupported or
non-literal discount declarations become non-blocking analysis warnings rather
than invented blocking evidence.

## Architecture

```mermaid
flowchart TB
  subgraph IntentPath["Intent path — proposals only"]
    Human["Human intent"] --> GPT["GPT-5.6"]
    GPT --> Proposal["Structured Tenet proposal"]
    Proposal --> Schema["Zod schema validation"]
    Schema --> Review["Human review"]
    Review -->|"explicit confirmation"| ActiveTenet["Active Control Plane Tenet"]
  end

  subgraph EnforcementPath["Enforcement path — deterministic authority"]
    Change["Repository / code change"] --> CLI["Tenet CLI"]
    CLI --> Analysis["TypeScript AST, dependency, and business-policy analysis"]
    Analysis --> Validators["Deterministic validators"]
    Validators --> Outcome{"PASS / WARN / BLOCK"}
    Outcome --> Result["Validation result and deterministic evidence"]
  end

  subgraph ObservabilityPath["Observability path"]
    Result --> API["Control Plane API"]
    API --> Postgres["PostgreSQL"]
    Postgres --> Dashboard["Dashboard: health, graph, violations, history"]
  end

  ActiveTenet -.-> RepositorySync["Explicit repository Tenet configuration sync"]
  RepositorySync --> Validators
  Result --> Explain["GPT-5.6 developer-friendly explanation"]
  Explain --> Dashboard
```

The diagram is deliberate: GPT-5.6 has no path to an authoritative PASS, WARN,
or BLOCK decision. Active Tenets and deterministic evidence drive validation.

## AI safety boundary

GPT-5.6 is implemented through the OpenAI Responses API for two bounded jobs:

1. Translate natural-language intent into a **draft** structured Tenet.
2. Turn existing deterministic violation evidence into a developer-friendly
   explanation.

The activation workflow is:

```text
Natural-language intent
→ GPT-5.6 structured proposal
→ strict schema validation
→ human review
→ explicit confirmation
→ active Tenet
→ deterministic enforcement
```

GPT output is untrusted until it passes strict schemas. A GPT-generated Tenet
is always a draft until a human explicitly confirms it. GPT-5.6 cannot activate
a Tenet, override a validator, calculate health, or independently produce a
PASS/WARN/BLOCK result.

The proposal API returns a draft only. Human confirmation persists the active
Control Plane Tenet; a repository-local configuration update remains an explicit
follow-up, not an AI side effect. For explanations, the server loads the
persisted deterministic violation and Tenet evidence by fingerprint before
asking GPT-5.6 to phrase it.

## What ships today

- **Tenet CLI:** local-first connect and check commands. Local enforcement
  completes before optional control-plane synchronization, so an unavailable
  network or database never changes a local result or exit code.
- **TypeScript analysis:** ts-morph analyzes .ts, .tsx, .mts, and .cts files
  through the repository tsconfig, including static ESM imports/exports, local
  resolution, and configured path aliases. Type-only, unresolved, and dynamic
  imports do not create blocking architecture findings.
- **Deterministic architecture validation:** direct runtime dependency checks
  with stable violation fingerprints and source-location evidence.
- **Deterministic business validation:** literal defineDiscount fact extraction
  and the supported maximum-combined-discount invariant.
- **Health:** explainable Architecture Health and Intent Health scores derived
  only from deterministic findings and Tenet evaluations.
- **Control Plane:** validated ingestion, idempotent validation runs,
  PostgreSQL persistence, violation lifecycle tracking, health snapshots, and
  normalized graph snapshots.
- **Product UI:** public landing page, repository Overview, Architecture,
  Tenets, Violations, Changes, and Analytics views backed by persisted data.
- **GPT-5.6 product workflow:** proposed-Tenet review/confirmation and
  deterministic-evidence explanation requests, with the safety boundary above.

### Product routes

| Route | Purpose |
| --- | --- |
| / | Public Tenet landing page |
| /overview | Primary Control Plane repository overview |
| /architecture | Intended versus persisted actual dependency graphs |
| /tenets | Persisted Tenets and proposed-Tenet workflow |
| /violations | Active and resolved deterministic violations |
| /changes | Validation and change history |
| /analytics | Health and validation analytics |
| /api/health | Control-plane readiness and configuration status |

The read APIs are repository-scoped under **/api/repositories/{slug}** for the
repository summary, validation runs, violations, health, and Tenets. The demo
repository slug is **commerce-platform**.

## Technology stack

- **TypeScript** across the monorepo
- **Node.js**, **npm workspaces**, and **Next.js / React** for the Control Plane
- **ts-morph** for TypeScript AST and dependency analysis
- **Zod** for shared contracts and boundary validation
- **PostgreSQL**, **Drizzle ORM**, and postgres.js for Control Plane data
- **Vitest** for unit and integration coverage
- **OpenAI Responses API** with **GPT-5.6** for proposal and explanation flows

## Repository layout

```text
apps/
  control-plane/          Next.js UI, API routes, Drizzle schema and migrations
packages/
  contracts/              Shared Zod schemas and result contracts
  engine/                 AST analysis, deterministic validators, health logic
  cli/                    tenet connect / tenet check command surface
examples/
  ecommerce/              Compliant TypeScript ecommerce repository and Tenets
fixtures/
  demo-scenarios/         Safe overlays for drift and semantic-conflict demos
scripts/                  Disposable local and persisted-history demo runners
BUILD_LOG.md              Factual implementation and verification log
```

## Run Tenet locally

### Prerequisites

- Node.js 20.9 or later
- npm (the repository declares npm 11.9.0)
- PostgreSQL only when using the persisted Control Plane
- An OpenAI API key only when using GPT-5.6 proposal or explanation features

### Install and configure

```bash
npm ci
```

Create a local environment file. It is ignored by Git.

```bash
cp .env.example .env
```

```powershell
Copy-Item .env.example .env
```

For PostgreSQL-backed functionality, edit .env with your own credentials:

```dotenv
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/tenet

# Optional: required only for GPT-5.6 proposal and explanation requests.
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.6-terra
```

DATABASE_URL is required for migrations and database-backed UI/API routes. The
local deterministic CLI check works without it. AWS RDS endpoints are
automatically given sslmode=require when no SSL mode is already present.

### Start the Control Plane

Apply migrations to a fresh PostgreSQL database, then start Next.js:

```bash
npm run db:migrate
npm run dev
```

Open the URL printed by Next.js:

- Landing page: http://localhost:3000/
- Control Plane overview: http://localhost:3000/overview
- Readiness endpoint: http://localhost:3000/api/health

If port 3000 is occupied, Next.js may choose another port such as 3001. Use
the **actual URL printed at startup** for the browser,
TENET_CONTROL_PLANE_URL, and the connect command below.

### Run the local deterministic demos

Run these **before connecting examples/ecommerce to a Control Plane**, or from
a clean clone/worktree. They use disposable fixture copies and are meant to
demonstrate local enforcement without adding telemetry to a database.

```bash
# Compliant Checkout → Gateway → Database: PASS, exit 0
npm run demo:architecture:compliant

# Direct Checkout → Database: BLOCK, exit 1 is expected
npm run demo:architecture:drift

# Baseline, Change A, Change B pass; combined 35% state BLOCKS, exit 1 expected
npm run demo:semantic:conflict
```

The non-zero exit status in the BLOCK scenarios is the expected enforcement
behavior, not a broken demo.

### Optionally synchronize a repository to the Control Plane

After the Control Plane is running, write a repository-local connection file
and run a real check:

```bash
npm run cli -- connect --url <CONTROL_PLANE_URL> --repository commerce-platform --repo examples/ecommerce
npm run cli -- check --repo examples/ecommerce
```

For example, replace <CONTROL_PLANE_URL> with the actual Next.js URL, such as
http://localhost:3000. The equivalent long option is
--control-plane-url.

Connect writes .tenet/control-plane.json inside the target repository and adds
it to that repository's local .gitignore. It is opt-in telemetry: local
PASS/WARN/BLOCK is printed first, and synchronization failure never changes the
deterministic result or its exit code. The first successful synchronization
upserts the repository, its configured Tenets, architecture, and validation
run; there is no separate bootstrap command.

### Reproduce the persisted five-run story (fresh database only)

demo:control-plane:history runs the real validators, HTTP ingestion API, and
read APIs through this sequence:

```text
PASS   100 / 100  compliant
BLOCK   95 / 100  architectural drift
PASS   100 / 100  architecture fixed
BLOCK  100 /   0  semantic conflict
PASS   100 / 100  semantic conflict fixed
```

It also checks idempotent ingestion, resolved violation lifecycle, health
history, and graph snapshots. Use it only with a **fresh, disposable database**
and a running local Control Plane; it does not purge existing history and
expects exactly the five runs it creates.

```powershell
$env:TENET_CONTROL_PLANE_URL = "http://localhost:3000"
npm run demo:control-plane:history
```

Do not run that script against an existing canonical/demo database that you
want to preserve.

## Quality checks

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run cli -- --help
```

The current verified suite contains **82 passing tests** across 20 test files.

## Security and trust model

- GPT output is treated as untrusted input and must pass strict schema
  validation.
- Explicit human confirmation is required before a proposed Tenet can become
  active.
- Deterministic validators, not GPT-5.6, own PASS/WARN/BLOCK and health.
- The Control Plane persists deterministic evidence and scores; it does not
  recalculate them with AI.
- Secrets belong in environment variables. Never commit .env, API keys,
  database credentials, private keys, or repository-local connection tokens.

.env and .tenet/control-plane.json are ignored by the repository; use
.env.example only as the safe configuration template.

## Current scope and limitations

Tenet is deliberately narrow in this Build Week release:

- Static analysis is TypeScript-focused and runtime architecture enforcement is
  based on static imports/exports, not arbitrary dynamic execution.
- Deterministic policy support is limited to the P0 direct-dependency boundary
  rule and literal combined-discount invariant described above.
- Repository analysis is local CLI-driven. GitHub OAuth, webhooks, automatic
  Git-hook installation, pull-request integration, and organization/RBAC
  workflows are not part of this release.
- The CLI accepts an optional bearer-token placeholder, but server-side
  authentication and authorization are not enforced in this P0 release.
- PostgreSQL is the central persistence store; graph snapshots are stored as
  JSON rather than in a graph database.

## Future direction

Possible next steps include CI/CD and pull-request integration, additional
language analyzers, more deterministic invariant types, organization policy
management, and richer architecture-evolution analysis.

## OpenAI Build Week and Codex

Tenet was built for the OpenAI Build Week Developer Tools track. The factual
development record is maintained in [BUILD_LOG.md](BUILD_LOG.md). Codex was
used throughout the engineering process for the workspace architecture,
TypeScript AST/dependency analysis, deterministic validators, CLI,
PostgreSQL/Drizzle Control Plane, product UI, tests, debugging, GPT-5.6
integration, and final product polish.

At runtime, GPT-5.6 has the separate, bounded role documented above:
interpreting natural-language intent into a proposal and explaining
deterministic evidence. The deterministic engine remains the enforcement
authority.

## License

See [LICENSE](LICENSE).
