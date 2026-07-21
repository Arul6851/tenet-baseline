import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(scriptDirectory, "../../..");
const environment = config({ path: resolve(workspaceRoot, ".env") });
const databaseUrl =
  globalThis.process.env.DATABASE_URL ?? environment.parsed?.DATABASE_URL;

if (!databaseUrl) {
  globalThis.process.stderr.write(
    "DATABASE_URL is required for database migrations. Add it to .env or set it in the command environment.\n",
  );
  globalThis.process.exitCode = 1;
}
