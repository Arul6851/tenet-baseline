# AGENTS.md

# Tenet Engineering Instructions

## Product

Tenet is an intent-aware engineering control plane.

Tagline:

> Git tells you what changed. Tenet tells you whether the change still belongs.

Tenet allows engineering teams to define architectural constraints and business invariants centrally and continuously validates repository changes against them.

The product must demonstrate two core capabilities:

1. Architectural Drift Detection
2. Semantic Conflict Detection

This project is being built for the OpenAI Build Week Developer Tools track.

---

# Primary Product Principle

Tenet must NOT become another generic "AI code reviewer."

The differentiation is:

Traditional developer tools validate:

- syntax
- types
- formatting
- tests
- vulnerabilities

Tenet validates:

- architectural intent
- business intent

The core abstraction is the TENET:

> Something that must remain true as software changes.

---

# Core Demo Scenario 1 — Architectural Drift

Declared architecture:

Checkout -> DatabaseGateway -> Database

Architectural tenet:

> Checkout must never access the database directly. Persistence must go through DatabaseGateway.

Violation:

Checkout -> RawDatabaseClient

Tenet must detect the dependency violation.

Expected result:

ARCHITECTURAL DRIFT DETECTED

Expected:

Checkout
   |
DatabaseGateway
   |
Database

Actual:

Checkout
   |
Database

Commit blocked.

Architecture Health decreases.

A violation is recorded in the control plane.

---

# Core Demo Scenario 2 — Semantic Conflict

Business tenet:

> Maximum combined customer discount must never exceed 30%.

Branch A:

holidayDiscount = 20%

Branch B:

premiumLoyaltyDiscount = 15%

Each change should independently appear valid.

Git should be capable of merging them without a textual conflict.

Together they create a possible 35% discount.

Tenet must detect this semantic conflict.

Expected:

SEMANTIC CONFLICT

Maximum:
30%

Potential:
35%

Evidence:
holidayDiscount()
premiumLoyaltyDiscount()

Merge blocked.

Intent Health decreases.

A violation is recorded.

---

# Engineering Philosophy

Prefer deterministic engineering over unnecessary LLM calls.

Architecture:

Git Diff
  ->
AST Analysis
  ->
Dependency Graph
  ->
Structured Tenets
  ->
Deterministic Validators
  ->
Semantic Reasoning where required
  ->
PASS / WARN / BLOCK

Do NOT implement the system as:

Repository -> LLM -> opinion.

Static architecture violations should be detected deterministically.

GPT-5.6 should be used where semantic reasoning genuinely adds value.

---

# GPT-5.6 Responsibilities

Appropriate GPT-5.6 usage includes:

- converting natural-language tenets into structured invariants
- semantic conflict analysis
- explaining complex violations
- reasoning about interactions between changed functions
- interpreting ambiguous business intent

Use structured outputs where possible.

All important conclusions should contain evidence.

---

# Architecture Health

Architecture Health must be deterministic and explainable.

Example deductions:

Boundary violation: -5
Circular dependency: -8
Unauthorized cross-layer dependency: -3
Architectural drift: -2

The UI must explain why the score changed.

Never generate Architecture Health arbitrarily using an LLM.

---

# Intent Health

Intent Health measures compliance with active tenets.

Example:

12 tenets

10 satisfied
1 at risk
1 violated

The score must be derived from compliance state.

---

# Web Application

The web application is the Tenet Control Plane.

Required pages:

1. Landing
2. Overview
3. Architecture
4. Tenets
5. Violations
6. Changes
7. Analytics

Prioritize excellent implementation of these pages over adding unrelated features.

---

# Dashboard

Dashboard must prominently display:

Architecture Health
Intent Health
Active Violations
Semantic Conflicts
Architectural Drift
Tenets Enforced

Also display:

Health history
Recent validation events
Recent commits
Health deltas

---

# Architecture Page

Must provide:

Intended Architecture
Actual Architecture

Visual dependency graphs.

Highlight differences/drift.

Example:

INTENDED:

Checkout -> Gateway -> Database

ACTUAL:

Checkout -> Gateway -> Database
Checkout -> Database [VIOLATION]

---

# Tenets Page

Users should be able to define tenets.

Example:

> Maximum combined customer discount must never exceed 30%.

Store structured representations.

Example:

type: business
severity: critical
enforcement: block_merge
scope:
  - checkout
  - pricing
  - loyalty

constraint:
  operator: <=
  value: 30

Natural-language creation may use GPT-5.6.

---

# Violations Page

Violations must contain:

severity
type
tenet
commit
author
branch
affected files
evidence
status
timestamp

Types:

architecture
semantic
intent

Statuses:

active
resolved
blocked

---

# Changes

Show:

commit
author
branch
architecture delta
intent delta
validation result

Commit detail should explain why health changed.

---

# Analytics

Include:

Architecture Health history
Intent Health history
Violations by type
Active vs resolved
Tenet compliance
Repository drift history

Avoid employee surveillance framing.

---

# CLI

Required commands should remain minimal.

Recommended:

tenet init
tenet connect
tenet check
tenet status
tenet validate

Do not build unnecessary CLI surface.

---

# Repository Analysis

MVP targets TypeScript repositories.

Preferred:

TypeScript Compiler API
or
ts-morph

Analyze:

imports
modules
dependencies
changed files
changed functions
relevant constants

Construct a real dependency graph.

---

# Git Safety

Never destructively modify a user's repository.

Use safe Git operations.

Validation may return a non-zero exit status to block hooks/CI.

---

# Database

The central control plane stores:

Repositories
Tenets
Architecture Nodes
Architecture Edges
Commits
Validation Runs
Violations
Health Snapshots

Choose the simplest reliable database architecture compatible with deployment.

---

# Demo Repository

Create a small realistic TypeScript ecommerce repository.

Required modules:

checkout
pricing
loyalty
payment
gateway
database

It must contain reproducible scenarios for:

Architectural Drift
Semantic Conflict

Provide scripts or documented commands for judges.

---

# UI Direction

Tenet should look like a serious developer infrastructure product.

Use:

strong typography
clean layout
dense but understandable engineering information
excellent charts
professional architecture graphs
subtle motion

Avoid:

generic AI gradients
chatbot-first UX
excessive glassmorphism
cartoon visuals
fake complexity

Architecture graphs and health scores should form the visual identity.

---

# Quality

Do not leave core features as fake UI.

Core demo paths must actually work.

Run continuously:

lint
typecheck
tests
build

Fix errors immediately.

---

# Tests

At minimum test:

architecture violation detection
valid architecture
semantic conflict scenario
health calculation
structured tenet parsing
blocking validation behavior

Critical invariant:

A BLOCKING violation must cause validation to fail.

Critical invariant:

A compliant repository must not produce a false blocking violation.

---

# Development Logging

Maintain BUILD_LOG.md continuously.

Record:

- significant Codex implementation work
- architectural decisions
- bugs encountered
- debugging performed
- tests created
- major refactors
- implementation milestones

This is required because Codex usage is an important part of the hackathon submission.

Never fabricate development statistics.

---

# Scope Priorities

## P0

Working dashboard
Architecture Health
Intent Health
Architecture model
Tenets
Architecture validator
Semantic conflict validator
Violations
CLI validation
Demo repository
Database
README
Tests

## P1

Visual architecture editor
Actual vs intended graph
Health timeline
Changes intelligence
Analytics polish

## P2

GitHub OAuth
RBAC
notifications
organization management
additional languages
enterprise integrations

Never sacrifice P0 for P2.

---

# Autonomous Work

The deadline is extremely close.

Do not repeatedly stop for approval on routine implementation choices.

When ambiguity exists, optimize for:

1. Demo reliability
2. Technical credibility
3. Product polish
4. Implementation speed

If an implementation path becomes disproportionately complex, simplify it while preserving the product thesis.

Always leave the repository in a runnable state.