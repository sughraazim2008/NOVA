import { defineConfig } from "vitest/config";

// Unit tests: no database, no network, no clock.
export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "tests/**/*.test.ts"],
    exclude: ["**/node_modules/**", "tests/e2e/**", "tests/integration/**"],
    environment: "node",
  },
});
