import { describe, expect, it } from "vitest";

import {
  resolvedViolationFingerprints,
  resolvedViolationIds,
} from "./violation-lifecycle";

describe("violation lifecycle", () => {
  it("retains an observed fingerprint and resolves only fingerprints absent from a later run", () => {
    const active = [
      { id: "violation-architecture", fingerprint: "architecture:checkout:database" },
      { id: "violation-semantic", fingerprint: "semantic:customer:max-discount" },
    ];
    const incoming = new Set(["architecture:checkout:database"]);

    expect(resolvedViolationIds(active, incoming)).toEqual(["violation-semantic"]);
    expect(resolvedViolationFingerprints(active, incoming)).toEqual([
      "semantic:customer:max-discount",
    ]);
  });

  it("does not create repeated lifecycle transitions for duplicate incoming evidence", () => {
    const active = [{ id: "violation-architecture", fingerprint: "architecture:checkout:database" }];
    const incoming = new Set([
      "architecture:checkout:database",
      "architecture:checkout:database",
    ]);

    expect(resolvedViolationIds(active, incoming)).toEqual([]);
    expect(resolvedViolationFingerprints(active, incoming)).toEqual([]);
  });
});
