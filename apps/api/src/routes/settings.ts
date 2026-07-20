import {
  settingsResponseSchema,
  updateSettingsRequestSchema,
} from "@wakyak/contracts";
import type { Prisma, PrismaClient } from "@wakyak/database";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

import { AppError } from "../errors.js";
import { requireProfile } from "../plugins/authentication.js";
import { errorResponseSchema } from "../schemas.js";

export function registerSettingsRoutes(
  app: FastifyInstance,
  database: PrismaClient,
): void {
  const server = app.withTypeProvider<ZodTypeProvider>();
  server.get(
    "/v1/settings",
    {
      preHandler: requireProfile,
      schema: { response: { 200: settingsResponseSchema } },
    },
    async (request) => {
      const settings = await database.profileSettings.upsert({
        where: { profileId: request.profile!.userId },
        create: { profileId: request.profile!.userId },
        update: {},
      });
      return { settings };
    },
  );
  server.patch(
    "/v1/settings",
    {
      preHandler: requireProfile,
      schema: {
        body: updateSettingsRequestSchema,
        response: { 200: settingsResponseSchema, 400: errorResponseSchema },
      },
    },
    async (request) => {
      if (!Object.keys(request.body).length)
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "At least one setting is required.",
        );
      const data = Object.fromEntries(
        Object.entries(request.body).filter((entry) => entry[1] !== undefined),
      ) as Prisma.ProfileSettingsUncheckedUpdateInput;
      const settings = await database.profileSettings.upsert({
        where: { profileId: request.profile!.userId },
        create: {
          ...(data as Prisma.ProfileSettingsUncheckedCreateInput),
          profileId: request.profile!.userId,
        },
        update: data,
      });
      return { settings };
    },
  );
}
