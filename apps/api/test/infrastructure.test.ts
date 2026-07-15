import type { PrismaClient } from "@wakyak/database";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { InMemoryEmailService } from "../src/auth/email.js";
import { testEnv } from "./helpers.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("infrastructure routes", () => {
  it("answers health without touching the database", async () => {
    const database = new Proxy(
      {},
      {
        get: () => () =>
          Promise.reject(new Error("database must not be queried")),
      },
    ) as PrismaClient;
    const app = await buildApp({
      env: testEnv,
      database,
      emailService: new InMemoryEmailService(),
      logger: false,
    });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("returns a sanitized readiness failure", async () => {
    const database = {
      $queryRaw: () =>
        Promise.reject(new Error("postgresql://secret@host/database")),
    } as unknown as PrismaClient;
    const app = await buildApp({
      env: testEnv,
      database,
      emailService: new InMemoryEmailService(),
      logger: false,
    });
    apps.push(app);
    const response = await app.inject({ method: "GET", url: "/ready" });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("postgresql://");
    expect(response.json()).toMatchObject({
      error: { code: "DATABASE_UNAVAILABLE" },
    });
  });
});
