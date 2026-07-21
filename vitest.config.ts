import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";

const rootDirectory = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@tenet/contracts": resolve(rootDirectory, "packages/contracts/src/index.ts"),
      "@tenet/engine": resolve(rootDirectory, "packages/engine/src/index.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["packages/*/src/**/*.test.ts"],
    passWithNoTests: false,
  },
});
