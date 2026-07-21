import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

/**
 * AWS RDS PostgreSQL commonly enforces TLS. Preserve an explicit sslmode from
 * the supplied URL, but make an RDS endpoint safe-by-default for local tools
 * and the running control plane without changing ordinary local PostgreSQL.
 */
export const withRdsSslMode = (connectionString: string): string => {
  try {
    const url = new URL(connectionString);

    if (
      url.hostname.endsWith(".rds.amazonaws.com") &&
      !url.searchParams.has("sslmode")
    ) {
      url.searchParams.set("sslmode", "require");
    }

    return url.toString();
  } catch {
    return connectionString;
  }
};

export const isDatabaseConfigured = (): boolean =>
  Boolean(process.env.DATABASE_URL);

export const createDatabase = (connectionString = process.env.DATABASE_URL) => {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required before a database connection can be created.");
  }

  const client = postgres(withRdsSslMode(connectionString), { max: 1 });
  return drizzle(client, { schema });
};

let configuredDatabase: ReturnType<typeof createDatabase> | undefined;

/**
 * Reuses one server-side Drizzle client for API requests. Callers must still
 * check `isDatabaseConfigured` before invoking it so an unavailable database
 * never affects local CLI enforcement.
 */
export const getDatabase = (): ReturnType<typeof createDatabase> => {
  if (!configuredDatabase) {
    configuredDatabase = createDatabase();
  }

  return configuredDatabase;
};
