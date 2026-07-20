import { Prisma, type PrismaClient } from "@wakyak/database";
import { authConfigResponseSchema } from "@wakyak/contracts";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { AppError } from "../errors.js";
import { errorResponseSchema } from "../schemas.js";

export function registerSystemRoutes(
  app: FastifyInstance,
  database: PrismaClient,
): void {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.get(
    "/v1/auth/config",
    {
      schema: { response: { 200: authConfigResponseSchema } },
      config: { rateLimit: false },
    },
    () => ({ googleEnabled: app.env.GOOGLE_AUTH_ENABLED }),
  );

  server.get(
    "/health",
    {
      schema: {
        response: { 200: z.object({ status: z.literal("ok") }) },
      },
      config: { rateLimit: false },
    },
    () => ({ status: "ok" as const }),
  );

  server.get(
    "/ready",
    {
      schema: {
        response: {
          200: z.object({ status: z.literal("ready") }),
          503: errorResponseSchema,
        },
      },
      config: { rateLimit: false },
    },
    async () => {
      try {
        await database.$queryRaw(Prisma.sql`SELECT 1`);
        return { status: "ready" as const };
      } catch {
        throw new AppError(
          503,
          "DATABASE_UNAVAILABLE",
          "The database is unavailable.",
        );
      }
    },
  );
}
