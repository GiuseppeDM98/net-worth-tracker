import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone mode copies only the files needed to run in production,
  // skipping the full node_modules — cuts Docker image size significantly.
  output: "standalone",
};

export default nextConfig;
