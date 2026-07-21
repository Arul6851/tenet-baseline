import { describe, expect, it } from "vitest";

import { withRdsSslMode } from "./client";

describe("withRdsSslMode", () => {
  it("adds required SSL mode for an AWS RDS PostgreSQL endpoint", () => {
    const result = new URL(
      withRdsSslMode(
        "postgresql://demo.cluster-abc123.ap-south-1.rds.amazonaws.com:5432/tenet",
      ),
    );

    expect(result.searchParams.get("sslmode")).toBe("require");
  });

  it("preserves an explicit SSL choice and ordinary local connections", () => {
    expect(
      new URL(
        withRdsSslMode(
          "postgresql://demo.cluster-abc123.ap-south-1.rds.amazonaws.com:5432/tenet?sslmode=verify-full",
        ),
      ).searchParams.get("sslmode"),
    ).toBe("verify-full");
    expect(
      new URL(withRdsSslMode("postgresql://localhost:5432/tenet"))
        .searchParams.has("sslmode"),
    ).toBe(false);
  });
});
