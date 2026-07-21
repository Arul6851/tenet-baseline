import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const controlPlaneDirectory = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(controlPlaneDirectory, "../../.env") });

const nextConfig: NextConfig = {
  transpilePackages: ["@tenet/contracts"],
};

export default nextConfig;
