export const landingNavigation = [
  { href: "#scenarios", label: "Scenarios" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#control-plane", label: "Control plane" },
] as const;

export const landingHistory = [
  { label: "01", status: "PASS", architecture: 100, intent: 100, note: "Repository compliant" },
  { label: "02", status: "BLOCK", architecture: 95, intent: 100, note: "Architectural Drift" },
  { label: "03", status: "PASS", architecture: 100, intent: 100, note: "Architecture restored" },
  { label: "04", status: "BLOCK", architecture: 100, intent: 0, note: "Semantic Conflict" },
  { label: "05", status: "PASS", architecture: 100, intent: 100, note: "Intent restored" },
] as const;

export const landingWorkflow = [
  {
    index: "01",
    title: "Declare intent",
    description: "Describe an architectural boundary or supported business invariant in the language your team already uses.",
  },
  {
    index: "02",
    title: "GPT-5.6 proposes structure",
    description: "Natural-language intent becomes a visible, supported structured Tenet proposal.",
  },
  {
    index: "03",
    title: "A human confirms",
    description: "The proposal remains a draft until someone explicitly chooses Confirm & Enforce.",
  },
  {
    index: "04",
    title: "Validators enforce",
    description: "TypeScript analysis and deterministic policy validators produce the authoritative result.",
  },
  {
    index: "05",
    title: "The control plane remembers",
    description: "Health, graph snapshots, validation history, and violation lifecycle stay inspectable.",
  },
] as const;

export const landingCapabilities = [
  {
    href: "/overview",
    label: "01",
    title: "Architecture Health",
    description: "An explainable score from real architecture findings and their deterministic deductions.",
  },
  {
    href: "/overview",
    label: "02",
    title: "Intent Health",
    description: "A separate compliance score for active, enforceable business Tenets.",
  },
  {
    href: "/architecture",
    label: "03",
    title: "Architecture graph",
    description: "Persisted intended and actual dependency snapshots, including unauthorized edges.",
  },
  {
    href: "/tenets",
    label: "04",
    title: "Tenets",
    description: "Structured policy with a GPT-5.6 proposal review and explicit human confirmation boundary.",
  },
  {
    href: "/violations",
    label: "05",
    title: "Violations",
    description: "Fingerprint-backed evidence, health impact, lifecycle state, and optional AI explanation.",
  },
  {
    href: "/changes",
    label: "06",
    title: "Changes & analytics",
    description: "Persisted validation outcomes, health history, violation categories, and Tenet compliance.",
  },
] as const;

export const technicalPipeline = [
  "Developer / repository",
  "Tenet CLI",
  "TypeScript AST + dependency analysis",
  "Deterministic architecture + business validators",
  "PASS / WARN / BLOCK",
  "Control Plane API",
  "PostgreSQL",
] as const;
