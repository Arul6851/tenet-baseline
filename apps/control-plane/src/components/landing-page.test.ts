import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { landingHistory } from "./landing-content.js";
import { LandingPage } from "./landing-page.js";
import { ProductShell } from "./product-shell.js";

describe("public landing page", () => {
  it("keeps the public story anchored to the real demo routes and sections", () => {
    const markup = renderToStaticMarkup(createElement(LandingPage));

    expect(markup).toContain('href="/overview"');
    expect(markup).toContain('href="#how-it-works"');
    expect(markup).toContain('id="architectural-drift"');
    expect(markup).toContain('id="semantic-conflict"');
    expect(markup).toContain('id="how-it-works"');
    expect(markup).toContain('id="control-plane"');
    expect(markup).toContain("AI interprets.");
    expect(markup).toContain("Tenet enforces.");
  });

  it("uses the actual five-run persisted demo health story", () => {
    expect(landingHistory.map((run) => run.status)).toEqual([
      "PASS",
      "BLOCK",
      "PASS",
      "BLOCK",
      "PASS",
    ]);
    expect(landingHistory.map((run) => run.architecture)).toEqual([100, 95, 100, 100, 100]);
    expect(landingHistory.map((run) => run.intent)).toEqual([100, 100, 100, 0, 100]);
  });
});

describe("control-plane route split", () => {
  it("keeps the dashboard navigation on /overview while preserving product routes", () => {
    const markup = renderToStaticMarkup(
      createElement(
        ProductShell,
        {
          activePage: "overview",
          connectionState: "connected",
          repositoryName: "commerce-platform",
          children: createElement("div", null, "Dashboard content"),
        },
      ),
    );

    expect(markup).toContain('href="/overview"');
    expect(markup).toContain('aria-current="page"');
    expect(markup).toContain('href="/architecture"');
    expect(markup).toContain('href="/tenets"');
    expect(markup).toContain('href="/violations"');
    expect(markup).toContain('href="/changes"');
    expect(markup).toContain('href="/analytics"');
  });
});
