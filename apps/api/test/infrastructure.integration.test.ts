import { prisma } from "@wakyak/database";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterAll, describe, expect, it } from "vitest";

import { createTestApp } from "./helpers.js";

describe("PostgreSQL infrastructure", () => {
  it("reports ready through a real Prisma query", async () => {
    const { app } = await createTestApp();
    const response = await app.inject({ method: "GET", url: "/ready" });
    await app.close();
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ready" });
  });

  it("applies committed migrations to an empty database", async () => {
    const databaseName = `wakyak_migration_${Date.now()}`;
    const root = resolve(import.meta.dirname, "../../..");
    const admin = new Client({
      connectionString: process.env.DATABASE_URL,
      database: "postgres",
    });
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE "${databaseName}"`);
      const url = new URL(process.env.DATABASE_URL!);
      url.pathname = `/${databaseName}`;
      execFileSync(
        "pnpm",
        ["--filter", "@wakyak/database", "exec", "prisma", "migrate", "deploy"],
        {
          cwd: root,
          env: { ...process.env, DATABASE_URL: url.toString() },
          stdio: "pipe",
        },
      );
      const testDb = new Client({ connectionString: url.toString() });
      await testDb.connect();
      const result = await testDb.query<{ table_name: string }>(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
      );
      await testDb.end();
      expect(result.rows.map((row) => row.table_name)).toEqual(
        expect.arrayContaining([
          "user",
          "session",
          "account",
          "verification",
          "Profile",
        ]),
      );
    } finally {
      await admin.query(
        `DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`,
      );
      await admin.end();
    }
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
