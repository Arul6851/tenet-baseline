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
