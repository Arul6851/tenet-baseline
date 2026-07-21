import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@tenet/contracts"],
};

export default nextConfig;
