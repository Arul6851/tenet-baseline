# Tenet

Intent-aware engineering. Keep every code change aligned with what your team
meant to build.

> Git tells you what changed. Tenet tells you whether the change still belongs.

## Foundation status

The repository now contains the P0 foundation for a local deterministic
validator and a hosted control plane. The first end-to-end validation slice and
dashboard experience are intentionally not built yet.

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
for the shell, but required once persistence and GPT-backed intent assistance
are invoked.

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
