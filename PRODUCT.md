# Tenet

## Intent-aware engineering

Git tells you what changed. Tenet tells you whether the change still belongs.

---

## Problem

Software teams document architecture and business rules, but these intentions are disconnected from the code-change pipeline.

Git understands textual changes.

Compilers understand syntax and types.

Tests understand explicitly tested behavior.

Linters understand coding rules.

None understand whether a change still aligns with the system the team intended to build.

As repositories evolve, two failures emerge:

### Architectural Drift

Code gradually violates intended system boundaries.

Example:

Checkout was designed to access persistence through DatabaseGateway.

Months later, a developer directly imports RawDatabaseClient.

The application still compiles.

Tests still pass.

The architecture has nevertheless drifted.

### Semantic Conflict

Two individually valid changes interact in a way that violates a business invariant.

Example:

Holiday discount: 20%

Premium loyalty discount: 15%

Both changes are valid independently.

Git merges them successfully.

Together they allow 35% discount despite the business rule limiting discounts to 30%.

---

# Solution

Tenet introduces an intent-validation layer into software engineering.

Teams centrally declare what must remain true.

These declarations are called Tenets.

Tenet continuously compares actual repository changes against:

- Intended Architecture
- Business Tenets

and produces:

PASS
WARNING
BLOCK

---

# Product Architecture

Tenet has two primary components.

## Control Plane

Web application providing:

Repository health
Architecture definition
Tenet definition
Violations
Change intelligence
Analytics

## Validation Engine

Developer/CI tooling providing:

Git analysis
AST analysis
Dependency extraction
Architecture validation
Semantic validation
Health calculations

---

# Primary User

Software engineering teams operating growing repositories.

Especially:

Platform engineers
Tech leads
Staff engineers
Engineering managers
Architecture teams

---

# Core User Journey

1. Connect repository.
2. Define intended architecture.
3. Define business tenets.
4. Install/use Tenet validator.
5. Developer changes code.
6. Tenet analyzes change.
7. Valid change passes.
8. Violation is explained with evidence.
9. Blocking violation prevents unsafe change.
10. Dashboard records validation and health impact.

---

# Dashboard

Primary repository overview.

Display:

Architecture Health
Intent Health
Active Violations
Semantic Conflicts
Architecture Drift
Tenets Enforced

Health trends should be visible.

Recent validation activity should be visible.

---

# Architecture

Users define the intended system graph.

Example:

Frontend -> API
API -> Checkout
Checkout -> Gateway
Gateway -> Database

Tenet analyzes the repository and derives the actual dependency graph.

Display:

Intended Architecture vs Actual Architecture.

Highlight unauthorized edges.

---

# Tenets

Tenets describe things that must remain true.

Examples:

"Maximum combined customer discount must never exceed 30%."

"Every payment operation must be idempotent."

"Checkout may access persistence only through DatabaseGateway."

Each tenet has:

Name
Description
Type
Scope
Severity
Enforcement
Structured constraint

---

# Violations

Every detected violation should contain evidence.

Example:

SEMANTIC CONFLICT

Combined discount can reach 35%.

Maximum:
30%

Evidence:

holidayDiscount = 20%
premiumLoyaltyDiscount = 15%

Affected Tenet:

MAXIMUM DISCOUNT

Result:

MERGE BLOCKED

---

# Health

Architecture Health measures structural compliance.

Intent Health measures tenet compliance.

Both scores must be explainable.

---

# Product Vision

Today:

Architecture validation
Semantic validation

Future:

Security intent
Privacy intent
Compliance intent
Performance intent
Reliability intent
Cost intent

Tenet becomes the intent layer of the software delivery lifecycle.