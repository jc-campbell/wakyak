import type { PrismaClient } from "@wakyak/database";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { InMemoryEmailService } from "../src/auth/email.js";
import { testEnv } from "./helpers.js";

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
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
    expect(response.headers["content-security-policy"]).toContain(
      "img-src 'self' data: http://localhost:9090",
    );
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

  it("serves web assets and falls back to the SPA without masking API 404s", async () => {
    const webRoot = await mkdtemp(join(tmpdir(), "wakyak-web-"));
    temporaryDirectories.push(webRoot);
    await mkdir(join(webRoot, "assets"));
    await writeFile(
      join(webRoot, "index.html"),
      "<!doctype html><title>WakYak testbed</title>",
    );
    await writeFile(join(webRoot, "assets", "app.js"), "export {};\n");

    const app = await buildApp({
      env: testEnv,
      emailService: new InMemoryEmailService(),
      logger: false,
      serveWeb: true,
      webRoot,
      attachmentCleanup: false,
      backgroundJobs: false,
    });
    apps.push(app);

    const asset = await app.inject({
      method: "GET",
      url: "/assets/app.js",
    });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers["cache-control"]).toContain("immutable");

    const clientRoute = await app.inject({
      method: "GET",
      url: "/protected",
      headers: { accept: "text/html,application/xhtml+xml" },
    });
    expect(clientRoute.statusCode).toBe(200);
    expect(clientRoute.body).toContain("WakYak testbed");
    expect(clientRoute.headers["cache-control"]).toBe("no-cache");

    const missingApiRoute = await app.inject({
      method: "GET",
      url: "/v1/does-not-exist",
      headers: { accept: "text/html" },
    });
    expect(missingApiRoute.statusCode).toBe(404);
    expect(missingApiRoute.json()).toMatchObject({
      error: { code: "NOT_FOUND" },
    });
  });
});
