import { afterEach, describe, expect, it, vi } from "vitest";

import { GET as getHealth } from "./[repositoryId]/health/route.js";
import { GET as getRepository } from "./[repositoryId]/route.js";
import { GET as getTenets } from "./[repositoryId]/tenets/route.js";
import { GET as getValidationRuns } from "./[repositoryId]/validation-runs/route.js";
import { GET as getViolations } from "./[repositoryId]/violations/route.js";

const context = {
  params: Promise.resolve({ repositoryId: "commerce-platform" }),
};
const request = new Request("http://control-plane.test/api/repositories/commerce-platform");

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("repository read APIs", () => {
  it("reports control-plane unavailability without DATABASE_URL", async () => {
    vi.stubEnv("DATABASE_URL", "");

    const responses = await Promise.all([
      getRepository(request, context),
      getValidationRuns(request, context),
      getViolations(request, context),
      getHealth(request, context),
      getTenets(request, context),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      503,
      503,
      503,
      503,
      503,
    ]);
    await expect(responses[0]?.json()).resolves.toEqual({
      error: "control_plane_unavailable",
    });
  });
});
