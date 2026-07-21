import type { ReactNode } from "react";

export type ControlPlanePage =
  | "overview"
  | "architecture"
  | "tenets"
  | "violations"
  | "changes"
  | "analytics";

interface ProductShellProps {
  activePage: ControlPlanePage;
  children: ReactNode;
  repositoryName?: string;
  repositorySlug?: string;
  connectionState: "loading" | "connected" | "error";
}

const navigation: ReadonlyArray<{
  id: ControlPlanePage;
  label: string;
  href: string;
  icon: string;
}> = [
  { id: "overview", label: "Overview", href: "/", icon: "overview" },
  {
    id: "architecture",
    label: "Architecture",
    href: "/architecture",
    icon: "architecture",
  },
  { id: "tenets", label: "Tenets", href: "/tenets", icon: "tenets" },
  {
    id: "violations",
    label: "Violations",
    href: "/violations",
    icon: "violations",
  },
  { id: "changes", label: "Changes", href: "/changes", icon: "changes" },
  {
    id: "analytics",
    label: "Analytics",
    href: "/analytics",
    icon: "analytics",
  },
];

const BrandMark = () => (
  <span aria-hidden="true" className="brand-mark">
    <span />
    <span />
    <span />
  </span>
);

const NavigationIcon = ({ icon }: { icon: string }) => {
  const common = {
    "aria-hidden": true,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.7,
    viewBox: "0 0 24 24",
  };

  switch (icon) {
    case "architecture":
      return (
        <svg {...common}>
          <circle cx="5" cy="5" r="2" />
          <circle cx="19" cy="5" r="2" />
          <circle cx="12" cy="19" r="2" />
          <path d="m6.8 6.1 3.7 10.7M17.2 6.1l-3.7 10.7" />
        </svg>
      );
    case "tenets":
      return (
        <svg {...common}>
          <path d="M7 3h8l3 3v15H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
          <path d="M15 3v4h4M9 12h6M9 16h5" />
        </svg>
      );
    case "violations":
      return (
        <svg {...common}>
          <path d="M12 3 2.8 20h18.4L12 3Z" />
          <path d="M12 9v5M12 17h.01" />
        </svg>
      );
    case "changes":
      return (
        <svg {...common}>
          <path d="M7 3v12a3 3 0 0 0 6 0V9a3 3 0 0 1 6 0v12" />
          <circle cx="7" cy="3" r="2" />
          <circle cx="19" cy="21" r="2" />
          <circle cx="13" cy="15" r="2" />
        </svg>
      );
    case "analytics":
      return (
        <svg {...common}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
  }
};

export const ProductShell = ({
  activePage,
  children,
  repositoryName,
  repositorySlug,
  connectionState,
}: ProductShellProps) => {
  const connectionLabel =
    connectionState === "connected"
      ? "Control plane connected"
      : connectionState === "error"
        ? "Control plane unavailable"
        : "Checking control plane";

  return (
    <div className="product-shell">
      <a className="skip-link" href="#control-plane-content">
        Skip to content
      </a>
      <aside className="product-sidebar" aria-label="Primary navigation">
        <a className="brand" href="/" aria-label="Tenet overview">
          <BrandMark />
          <span>Tenet</span>
        </a>

        <div className="repository-chip" aria-label="Current repository">
          <span className="repository-glyph" aria-hidden="true">
            {"</>"}
          </span>
          <span className="repository-chip-copy">
            <span className="repository-chip-label">Repository</span>
            <strong>{repositoryName ?? repositorySlug ?? "Loading repository"}</strong>
          </span>
          <span className="repository-chevron" aria-hidden="true">
            ▾
          </span>
        </div>

        <nav className="product-nav">
          <span className="nav-label">Control plane</span>
          {navigation.map((item) => (
            <a
              aria-current={item.id === activePage ? "page" : undefined}
              className={`nav-link ${item.id === activePage ? "is-active" : ""}`}
              href={item.href}
              key={item.id}
            >
              <NavigationIcon icon={item.icon} />
              <span>{item.label}</span>
            </a>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className={`connection-status ${connectionState}`} role="status">
            <span aria-hidden="true" className="connection-indicator" />
            <span>{connectionLabel}</span>
          </div>
          <p>
            Intent-aware enforcement for architecture and business invariants.
          </p>
        </div>
      </aside>

      <div className="product-main">
        <header className="product-topbar">
          <div className="breadcrumb">
            <span>{repositoryName ? "acme" : "Repository"}</span>
            <span aria-hidden="true">/</span>
            <strong>{repositoryName ?? "commerce-platform"}</strong>
          </div>
          <div className="topbar-status" role="status">
            <span className={`connection-indicator ${connectionState}`} aria-hidden="true" />
            <span>{connectionState === "connected" ? "Enforcement reporting" : connectionLabel}</span>
          </div>
        </header>
        <main className="control-plane-content" id="control-plane-content">
          {children}
        </main>
      </div>
    </div>
  );
};
