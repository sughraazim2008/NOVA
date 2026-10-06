import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source, so Next compiles them.
  transpilePackages: [
    "@nova/ai",
    "@nova/behaviour",
    "@nova/database",
    "@nova/planner",
    "@nova/simulation",
    "@nova/types",
  ],
};

export default nextConfig;
