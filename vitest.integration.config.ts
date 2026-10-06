import { defineConfig } from "vitest/config";

// Integration tests share one PostgreSQL test database, so files run one at a time.
export default defineConfig({
  test: {
    include: ["tests/integration/**/*.test.ts"],
    environment: "node",
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
