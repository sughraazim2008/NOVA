import { describe, expect, it } from "vitest";

// Proves every workspace package resolves from the test runner.
const packages = [
  "@nova/types",
  "@nova/database",
  "@nova/ai",
  "@nova/planner",
  "@nova/behaviour",
  "@nova/simulation",
];

describe("workspace", () => {
  it.each(packages)("resolves %s", async (name) => {
    await expect(import(name)).resolves.toBeDefined();
  });
});
