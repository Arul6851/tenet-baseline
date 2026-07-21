"use client";

import { useEffect } from "react";

/**
 * Adds a one-time, progressive enhancement for landing-page sections.
 *
 * Content is intentionally visible before this runs so a delayed script,
 * unsupported browser, or disabled JavaScript never hides the product story.
 */
export function LandingMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>("[data-landing-root]");
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (!root || prefersReducedMotion.matches) {
      return;
    }

    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-landing-reveal]"));

    if (!("IntersectionObserver" in window)) {
      targets.forEach((target) => target.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }

          const target = entry.target as HTMLElement;
          target.classList.add("is-visible");
          observer.unobserve(target);
        }
      },
      {
        rootMargin: "0px 0px -8% 0px",
        threshold: 0.12,
      },
    );

    targets.forEach((target) => observer.observe(target));

    return () => observer.disconnect();
  }, []);

  return null;
}
