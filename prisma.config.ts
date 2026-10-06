import { defineConfig } from "prisma/config";

// Prisma does not read .env by itself. Load it when present; CI and production set real variables.
try {
  process.loadEnvFile(".env");
} catch {
  // no .env file
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "",
  },
});
