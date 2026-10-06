try {
  process.loadEnvFile(".env");
} catch {
  // no .env file; rely on real environment variables
}

function resolve(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set. Copy .env.example to .env.");
  if (url === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must not be the development database.");
  return url;
}

// Resolved once, before setup.ts points DATABASE_URL at the test database.
const url = resolve();

export const testDatabaseUrl = (): string => url;
