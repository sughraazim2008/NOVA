import js from "@eslint/js";
import tseslint from "typescript-eslint";

// packages that must stay pure: no framework, database, LLM SDK or sibling packages other than types
const purePackages = ["planner", "behaviour", "simulation"];

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
        {
          patterns: [
            {
              group: ["next", "next/*", "react", "react-dom", "@prisma/*", "@nova/database", "@nova/ai"],
              message: "planner, behaviour and simulation are pure: they may import @nova/types only.",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Pure packages do no I/O." },
      ],
      "no-restricted-properties": [
        "error",
        { object: "Date", property: "now", message: "Pass the date in; pure packages never read the clock." },
        { object: "Math", property: "random", message: "Pure packages are deterministic." },
      ],
    },
  },
);
