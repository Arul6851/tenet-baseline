import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "drizzle-kit";

const controlPlaneDirectory = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(controlPlaneDirectory, "../../.env") });

const withRdsSslMode = (connectionString: string): string => {
  const url = new URL(connectionString);

  if (
    url.hostname.endsWith(".rds.amazonaws.com") &&
    !url.searchParams.has("sslmode")
  ) {
    url.searchParams.set("sslmode", "require");
  }

  return url.toString();
};

// The fallback lets `drizzle-kit generate` run without a database. It has no
// credentials; the db:migrate wrapper requires a real DATABASE_URL before
// Drizzle is invoked.
const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://localhost/tenet";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: withRdsSslMode(connectionString),
  },
});
