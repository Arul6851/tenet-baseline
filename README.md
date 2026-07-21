# Tenet

Intent-aware engineering. Keep every code change aligned with what your team
meant to build.

> Git tells you what changed. Tenet tells you whether the change still belongs.

## Current status

The repository contains the P0 local deterministic validator and its first
control-plane persistence path. `tenet check` always completes local
enforcement first, then optionally sends the structured deterministic result to
the control plane. A synchronization failure never changes a local PASS, WARN,
or BLOCK result.

The polished dashboard remains intentionally deferred. The control plane now
stores real validation data for it to consume later.

```text
apps/control-plane     Next.js control-plane shell, API foundation, Drizzle schema
packages/contracts     Shared Zod contracts and deterministic result shapes
packages/engine        Validator interfaces, health calculations, AI boundary
packages/cli           `tenet` command surface
examples/ecommerce     Clean TypeScript ecommerce baseline
fixtures/demo-scenarios  Reproducible drift and semantic-conflict overlays
```

## Local setup

```bash
npm install
copy .env.example .env
npm run dev
```

The control-plane shell runs at `http://localhost:3000`; its safe readiness
endpoint is `GET /api/health`. `DATABASE_URL` and `OPENAI_API_KEY` are optional
for the shell, but `DATABASE_URL` is required before validation results can be
persisted.

## Control-plane persistence

Use a fresh PostgreSQL database for the P0 control plane. Set real local or
hosted credentials in `.env`, then migrate and start the app:

```bash
npm run db:migrate
npm run dev
```

The current P0 migration explicitly refuses a populated pre-persistence
database. This avoids fabricating historic scores, enforcement values, or
idempotency keys. A future migration can handle legacy telemetry deliberately.

Connect the ecommerce demo repository and run a real local check:

```bash
npm run cli -- connect --url http://localhost:3000 --repository commerce-platform --repo examples/ecommerce
npm run cli -- check --repo examples/ecommerce
```

The first successful synchronization bootstraps the `commerce-platform`
repository record, its active architecture and business Tenets, intended
architecture, and the completed validation run. It does not seed fabricated
validation history.

With a fresh migrated database and the control plane running, the disposable
history runner executes the complete five-run story through the real CLI and
API, then verifies the read APIs:

```powershell
$env:TENET_CONTROL_PLANE_URL = "http://localhost:3000"
npm run demo:control-plane:history
```

It records compliant, architectural-drift, fixed-architecture,
semantic-conflict, and fixed-semantic states. It expects the final state to
have two resolved logical violations and both health scores restored to 100.

Every request has a client-generated UUID idempotency key. Reposting the same
completed payload returns the existing validation run rather than creating
duplicate health snapshots or violations. Logical violations are unique by
repository plus deterministic fingerprint; later runs that no longer observe a
fingerprint mark it resolved while retaining per-run evidence history.

Available data APIs use the stable repository slug:

```text
POST /api/validation-runs
GET  /api/repositories/commerce-platform
GET  /api/repositories/commerce-platform/validation-runs
GET  /api/repositories/commerce-platform/violations
GET  /api/repositories/commerce-platform/health
GET  /api/repositories/commerce-platform/tenets
```

The API validates the shared Zod contract before persistence. Each run stores
the exact deterministic Architecture and Intent Health scores, deductions,
warnings, Git metadata when available, and the normalized actual dependency
graph together with the intended architecture snapshot.

## Verification

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run cli -- --help
```

## GPT-5.6 boundary

The server-only GPT-5.6 adapter uses the Responses API and structured outputs
to propose draft Tenets from natural language and to explain deterministic
violation evidence. It cannot activate a Tenet, change a validation result, or
produce an independent blocking decision. Human confirmation and deterministic
validators remain the enforcement boundary.
