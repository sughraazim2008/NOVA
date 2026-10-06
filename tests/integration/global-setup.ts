import { execSync } from "node:child_process";
import { testDatabaseUrl } from "./env";

// Bring the test database up to the current schema before any test file runs.
export default function setup() {
  execSync("pnpm exec prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: "pipe",
  });
}
