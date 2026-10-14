import js from "@eslint/js";
import tseslint from "typescript-eslint";

// packages that must stay pure: no framework, database, LLM SDK, clock or randomness
const purePackages = ["planner", "behaviour", "simulation"];
const frameworkAndIO = ["next", "next/*", "react", "react-dom", "@prisma/*", "@nova/database", "@nova/ai"];

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/coverage/**", "**/next-env.d.ts", "packages/database/src/generated/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // A leading underscore marks a parameter that is deliberately unused.
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    // Test code reads untyped JSON responses.
    files: ["tests/**/*.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    files: purePackages.map((name) => `packages/${name}/src/**/*.ts`),
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: frameworkAndIO, message: "planner, behaviour and simulation are pure: no framework, database or model." }] },
      ],
      "no-restricted-globals": ["error", { name: "fetch", message: "Pure packages do no I/O." }],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "Pass the date in; pure packages never read the clock." },
        { object: "Math", property: "random", message: "Pure packages are deterministic." },
      ],
    },
  },
  {
    // The planner must never learn that behaviour or the game layer exists (docs/game-layer.md, rule 8).
    // This block comes after the one above and replaces its import rule for the planner alone.
    files: ["packages/planner/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [...frameworkAndIO, "@nova/behaviour", "@nova/simulation"],
              message: "The planner may import @nova/types only. In particular it must not see behaviour or game state.",
            },
          ],
        },
      ],
    },
  },
);
