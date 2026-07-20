import { resolve } from "node:path";

import { config } from "dotenv";

config({ path: resolve(import.meta.dirname, "../../../.env"), quiet: true });
if (process.env.WAKYAK_INTEGRATION === "true") {
  const testDatabaseUrl = process.env.TEST_DATABASE_URL;
  if (!testDatabaseUrl)
    throw new Error("TEST_DATABASE_URL is required for integration tests.");
  if (testDatabaseUrl === process.env.DATABASE_URL)
    throw new Error("TEST_DATABASE_URL must be different from DATABASE_URL.");
  process.env.DATABASE_URL = testDatabaseUrl;
}
process.env.NODE_ENV = "test";
