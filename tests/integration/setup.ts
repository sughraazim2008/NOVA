import { testDatabaseUrl } from "./env";

// Application code reads DATABASE_URL; in tests that must be the test database.
process.env.DATABASE_URL = testDatabaseUrl();
