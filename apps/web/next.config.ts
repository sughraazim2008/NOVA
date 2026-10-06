import type { NextConfig } from "next";

// One .env at the repository root serves every package; Next only looks in apps/web by itself.
try {
  process.loadEnvFile("../../.env");
} catch {
  // no .env file; rely on real environment variables
}

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
  // Native database driver; keep it out of the bundle.
  serverExternalPackages: ["pg"],
};

export default nextConfig;
