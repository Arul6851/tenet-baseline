import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "drizzle-kit";

const controlPlaneDirectory = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(controlPlaneDirectory, "../../.env") });

// The fallback lets `drizzle-kit generate` run without a database. The
// db:migrate wrapper requires a real DATABASE_URL before Drizzle is invoked.
const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/tenet";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
