import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export const isDatabaseConfigured = (): boolean =>
  Boolean(process.env.DATABASE_URL);

export const createDatabase = (connectionString = process.env.DATABASE_URL) => {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required before a database connection can be created.");
  }

  const client = postgres(connectionString, { max: 1 });
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
