import React, { type ReactNode } from "react";

import { BrandMark } from "./brand-mark";
import { LandingMotion } from "./landing-motion";
import {
  landingCapabilities,
  landingHistory,
  landingNavigation,
  landingWorkflow,
  technicalPipeline,
} from "./landing-content";

const Arrow = () => <span aria-hidden="true" className="landing-arrow">→</span>;

const RouteNode = ({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "danger";
}) => (
  <span className={`landing-route-node ${tone === "danger" ? "is-danger" : ""}`}>
    {children}
  </span>
);

export function LandingPage() {
  return (
    <div className="landing-page" data-landing-root>
      <LandingMotion />
      <a className="skip-link" href="#landing-content">Skip to content</a>

      <header className="landing-nav-wrap">
        <nav aria-label="Public navigation" className="landing-nav landing-container">
          <a aria-label="Tenet home" className="landing-brand" href="#top">
            <BrandMark />
            <span>Tenet</span>
          </a>
          <div className="landing-nav-links">
            {landingNavigation.map((item) => (
              <a href={item.href} key={item.href}>{item.label}</a>
            ))}
          </div>
          <a className="landing-nav-demo" href="/overview">View live demo <Arrow /></a>
        </nav>
      </header>

      <main id="landing-content">
        <section className="landing-hero" id="top">
          <div className="landing-container landing-hero-grid">
            <div className="landing-hero-copy landing-reveal">
              <p className="landing-kicker"><span aria-hidden="true" /> Intent-aware engineering control plane</p>
              <h1>Your code still compiles.<br /><span>Your architecture doesn&apos;t.</span></h1>
              <p className="landing-lede">
                Tenet makes architectural boundaries and supported business invariants enforceable.
                It catches changes Git, tests, and linters can accept but that violate decisions your team already made.
              </p>
              <div className="landing-hero-actions">
                <a className="landing-button landing-button-primary" href="/overview">View Live Demo <Arrow /></a>
                <a className="landing-button landing-button-secondary" href="#how-it-works">See How It Works <Arrow /></a>
              </div>
              <ul className="landing-proof-points" aria-label="Tenet principles">
                <li><span aria-hidden="true">✓</span> Deterministic PASS / WARN / BLOCK</li>
                <li><span aria-hidden="true">✓</span> Evidence-backed health</li>
                <li><span aria-hidden="true">✓</span> Human-confirmed AI proposals</li>
              </ul>
            </div>

            <aside aria-label="Architectural Drift validation preview" className="landing-validation-preview landing-reveal">
              <div className="landing-preview-toolbar">
                <span className="landing-preview-title"><span aria-hidden="true" className="landing-pulse" /> tenet check</span>
                <span className="landing-mini-status block">BLOCK</span>
              </div>
              <div className="landing-preview-body">
                <p className="landing-preview-kicker">Checkout Persistence Boundary</p>
                <h2>Unauthorized direct dependency</h2>
                <div className="landing-code-row">
                  <span>src/checkout/checkout-service.ts:1</span>
                  <code>import &quot;../database/raw-database-client.js&quot;</code>
                </div>
                <div className="landing-mini-graph" aria-label="Checkout directly depends on Database">
                  <RouteNode>Checkout</RouteNode><Arrow /><RouteNode tone="danger">Database</RouteNode>
                </div>
                <div className="landing-preview-result">
                  <div><span>Architecture Health</span><strong>95<span>/100</span></strong></div>
                  <p><strong>BLOCK</strong> Checkout bypasses the declared persistence boundary.</p>
                </div>
              </div>
            </aside>
          </div>
        </section>

        <section aria-label="Validator-generated demo history" className="landing-history">
          <div className="landing-container">
            <div className="landing-history-heading" data-landing-reveal>
              <p className="landing-kicker"><span aria-hidden="true" /> Real demo history</p>
              <p>Five validator-generated states persisted by the control plane.</p>
            </div>
            <ol className="landing-history-list" data-landing-reveal="group">
              {landingHistory.map((run) => (
                <li className={`landing-history-run ${run.status.toLowerCase()}`} key={run.label}>
                  <span className="landing-history-index">Run {run.label}</span>
                  <span className="landing-mini-status">{run.status}</span>
                  <strong>{run.note}</strong>
                  <span>Architecture <b>{run.architecture}</b></span>
                  <span>Intent <b>{run.intent}</b></span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="landing-section" id="scenarios">
          <div className="landing-container">
            <header className="landing-section-heading" data-landing-reveal>
              <p className="landing-kicker"><span aria-hidden="true" /> The changes that get through anyway</p>
              <h2>Git sees a clean change.<br />Tenet sees the decision it breaks.</h2>
              <p>Two supported enforcement paths, both based on deterministic evidence from real TypeScript source.</p>
            </header>

            <div className="landing-scenarios" data-landing-reveal="group">
              <article className="landing-scenario architecture" id="architectural-drift">
                <header className="landing-scenario-header">
                  <div>
                    <p className="landing-card-index">01 / ARCHITECTURAL DRIFT</p>
                    <h3>Checkout crosses a boundary it was never meant to cross.</h3>
                  </div>
                  <span className="landing-mini-status block">BLOCK</span>
                </header>
                <p className="landing-scenario-copy">The application compiles. The direct runtime import still bypasses the declared persistence path.</p>
                <div className="landing-route-comparison">
                  <div className="landing-route-group expected">
                    <p>Declared architecture</p>
                    <div><RouteNode>Checkout</RouteNode><Arrow /><RouteNode>DatabaseGateway</RouteNode><Arrow /><RouteNode>Database</RouteNode></div>
                  </div>
                  <div className="landing-route-divider" aria-hidden="true" />
                  <div className="landing-route-group detected">
                    <p>Detected dependency</p>
                    <div><RouteNode>Checkout</RouteNode><Arrow /><RouteNode tone="danger">Database</RouteNode></div>
                    <span className="landing-unauthorized-note">Unauthorized direct dependency</span>
                  </div>
                </div>
                <footer className="landing-scenario-footer">
                  <span><b>Evidence</b> src/checkout/checkout-service.ts</span>
                  <span><b>Effect</b> Architecture Health 100 <Arrow /> 95</span>
                </footer>
              </article>

              <article className="landing-scenario semantic" id="semantic-conflict">
                <header className="landing-scenario-header">
                  <div>
                    <p className="landing-card-index">02 / SEMANTIC CONFLICT</p>
                    <h3>Two valid changes create an invalid outcome together.</h3>
                  </div>
                  <span className="landing-mini-status block">BLOCK</span>
                </header>
                <p className="landing-scenario-copy">The changes live in different files, so Git has no textual conflict. The resulting business intent is still violated.</p>
                <div className="landing-discount-flow">
                  <div className="landing-discount-change"><span>Holiday Discount</span><strong>20%</strong><small>Valid alone</small></div>
                  <div className="landing-discount-change"><span>Premium Loyalty</span><strong>15%</strong><small>Valid alone</small></div>
                  <div className="landing-merge-marker"><span>No textual Git conflict</span><Arrow /></div>
                  <div className="landing-discount-result"><span>Potential combined discount</span><strong>35%</strong><small>Declared maximum <b>30%</b></small></div>
                </div>
                <footer className="landing-scenario-footer">
                  <span><b>Tenet</b> Maximum Combined Discount</span>
                  <span><b>Effect</b> Intent Health 100 <Arrow /> 0</span>
                </footer>
              </article>
            </div>
          </div>
        </section>

        <section className="landing-section landing-workflow-section" id="how-it-works">
          <div className="landing-container">
            <div className="landing-workflow-intro" data-landing-reveal>
              <div>
                <p className="landing-kicker"><span aria-hidden="true" /> From team decision to enforceable policy</p>
                <h2>AI interprets.<br /><span>Tenet enforces.</span></h2>
              </div>
              <p>GPT-5.6 proposes supported structure and explains deterministic evidence. It never activates a Tenet automatically, overrides a validator, changes health, or independently blocks a change.</p>
            </div>
            <ol className="landing-workflow-list" data-landing-reveal="group">
              {landingWorkflow.map((step) => (
                <li key={step.index}>
                  <span>{step.index}</span>
                  <div><h3>{step.title}</h3><p>{step.description}</p></div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="landing-section landing-control-plane-section" id="control-plane">
          <div className="landing-container">
            <header className="landing-section-heading split" data-landing-reveal>
              <div>
                <p className="landing-kicker"><span aria-hidden="true" /> The record of intent</p>
                <h2>Intent, made operational.</h2>
              </div>
              <p>The control plane is driven by actual PostgreSQL-backed validation history, health snapshots, graph snapshots, Tenets, and violation lifecycle evidence.</p>
            </header>
            <div className="landing-capability-grid" data-landing-reveal="group">
              {landingCapabilities.map((capability) => (
                <a className="landing-capability" href={capability.href} key={capability.title}>
                  <span>{capability.label}</span>
                  <h3>{capability.title}</h3>
                  <p>{capability.description}</p>
                  <em>Open <Arrow /></em>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section landing-technical-section" id="technical">
          <div className="landing-container">
            <header className="landing-section-heading split" data-landing-reveal>
              <div>
                <p className="landing-kicker"><span aria-hidden="true" /> Built for the delivery path</p>
                <h2>Evidence first.<br />Enforcement stays local.</h2>
              </div>
              <p>Repository source stays in deterministic analysis. Control-plane synchronization preserves results after local enforcement, never decides it.</p>
            </header>
            <div className="landing-pipeline" aria-label="Tenet technical pipeline" data-landing-reveal="group">
              <div className="landing-pipeline-lane deterministic">
                <p>Authoritative enforcement path</p>
                <ol>
                  {technicalPipeline.map((stage, index) => (
                    <li key={stage}><span>{String(index + 1).padStart(2, "0")}</span><strong>{stage}</strong></li>
                  ))}
                </ol>
              </div>
              <div className="landing-pipeline-lane ai">
                <p>Interpretation and explanation path</p>
                <div className="landing-ai-flow">
                  <span>Natural-language intent or deterministic evidence</span><Arrow /><strong>GPT-5.6</strong><Arrow /><span>Draft Tenet or developer explanation</span>
                </div>
                <div className="landing-human-gate"><span aria-hidden="true">✓</span> Human confirmation required before a proposed Tenet becomes active.</div>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-final-cta">
          <div className="landing-container" data-landing-reveal>
            <p className="landing-kicker"><span aria-hidden="true" /> Intent is a control surface</p>
            <h2>Your architecture shouldn&apos;t exist only in a diagram.<br /><span>Make it enforceable.</span></h2>
            <a className="landing-button landing-button-primary" href="/overview">View Live Demo <Arrow /></a>
          </div>
        </section>
      </main>

      <footer className="landing-footer landing-container">
        <a aria-label="Tenet home" className="landing-brand" href="#top"><BrandMark /><span>Tenet</span></a>
        <p>Git tells you what changed. Tenet tells you whether the change still belongs.</p>
        <a href="/overview">Open control plane <Arrow /></a>
      </footer>
    </div>
  );
}
