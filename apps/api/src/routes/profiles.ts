import { Prisma, type PrismaClient } from "@wakyak/database";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { AppError } from "../errors.js";
import {
  createProfileBodySchema,
  handleSchema,
  updateProfileBodySchema,
  userIdSchema,
} from "../profile-validation.js";
import {
  errorResponseSchema,
  meResponseSchema,
  profileResponseSchema,
} from "../schemas.js";
import { requireAuthentication } from "../plugins/authentication.js";

const publicSelect = {
  userId: true,
  handle: true,
  displayName: true,
} as const;

function uniqueTargets(error: unknown): string[] {
  const normalizeFields = (values: unknown[]): string[] =>
    values
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.replaceAll('"', ""));

  if (
    typeof error !== "object" ||
    error === null ||
    !("code" in error) ||
    error.code !== "P2002"
  ) {
    return [];
  }
  if (
    !("meta" in error) ||
    typeof error.meta !== "object" ||
    error.meta === null
  )
    return [];
  const meta = error.meta;
  if ("target" in meta) {
    const target = meta.target;
    if (Array.isArray(target)) {
      return normalizeFields(target);
    }
    if (typeof target === "string") return [target];
    if (typeof target === "object" && target !== null && "fields" in target) {
      const fields = target.fields;
      if (Array.isArray(fields)) {
        return normalizeFields(fields);
      }
    }
  }

  if (!("driverAdapterError" in meta)) return [];
  const adapterError = meta.driverAdapterError;
  if (
    typeof adapterError !== "object" ||
    adapterError === null ||
    !("cause" in adapterError)
  ) {
    return [];
  }
  const cause = adapterError.cause;
  if (typeof cause !== "object" || cause === null || !("constraint" in cause))
    return [];
  const constraint = cause.constraint;
  if (
    typeof constraint !== "object" ||
    constraint === null ||
    !("fields" in constraint)
  )
    return [];
  const fields = constraint.fields;
  if (Array.isArray(fields)) {
    return normalizeFields(fields);
  }
  return [];
}

function mapCreateConflict(error: unknown): never {
  const targets = uniqueTargets(error);
  if (targets.includes("authUserId")) {
    throw new AppError(
      409,
      "PROFILE_ALREADY_EXISTS",
      "A profile already exists for this user.",
    );
  }
  if (targets.includes("userId")) {
    throw new AppError(409, "USER_ID_TAKEN", "That user ID is unavailable.");
  }
  if (targets.includes("handle")) {
    throw new AppError(409, "HANDLE_TAKEN", "That handle is unavailable.");
  }
  throw error;
}

function applyResponseCookies(reply: FastifyReply, headers: Headers): void {
  const cookies = headers.getSetCookie();
  if (cookies.length > 0) {
    reply.header("set-cookie", cookies);
  }
}

export function registerProfileRoutes(
  app: FastifyInstance,
  database: PrismaClient,
): void {
  const server = app.withTypeProvider<ZodTypeProvider>();
  const securedErrors = {
    400: errorResponseSchema,
    401: errorResponseSchema,
    404: errorResponseSchema,
    409: errorResponseSchema,
    500: errorResponseSchema,
  };

  server.get(
    "/v1/me",
    {
      preHandler: requireAuthentication,
      schema: { response: { 200: meResponseSchema, ...securedErrors } },
    },
    async (request) => {
      const authUser = request.authSession!.user;
      const profile = await database.profile.findUnique({
        where: { authUserId: authUser.id },
        select: publicSelect,
      });
      return { user: authUser, profile };
    },
  );

  server.post(
    "/v1/profile",
    {
      preHandler: requireAuthentication,
      schema: {
        body: createProfileBodySchema,
        response: { 201: profileResponseSchema, ...securedErrors },
      },
    },
    async (request, reply) => {
      try {
        const profile = await database.profile.create({
          data: {
            ...request.body,
            authUserId: request.authSession!.user.id,
          },
          select: publicSelect,
        });
        return reply.code(201).send({ profile });
      } catch (error) {
        mapCreateConflict(error);
      }
    },
  );

  server.patch(
    "/v1/profile",
    {
      preHandler: requireAuthentication,
      schema: {
        body: updateProfileBodySchema,
        response: { 200: profileResponseSchema, ...securedErrors },
      },
    },
    async (request) => {
      try {
        const data = {
          ...(request.body.handle === undefined
            ? {}
            : { handle: request.body.handle }),
          ...(request.body.displayName === undefined
            ? {}
            : { displayName: request.body.displayName }),
        };
        const profile = await database.profile.update({
          where: { authUserId: request.authSession!.user.id },
          data,
          select: publicSelect,
        });
        return { profile };
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2025"
        ) {
          throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found.");
        }
        if (uniqueTargets(error).includes("handle")) {
          throw new AppError(
            409,
            "HANDLE_TAKEN",
            "That handle is unavailable.",
          );
        }
        throw error;
      }
    },
  );

  server.get(
    "/v1/profiles/:userId",
    {
      schema: {
        params: z.object({ userId: userIdSchema }),
        response: {
          200: profileResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const profile = await database.profile.findUnique({
        where: { userId: request.params.userId },
        select: publicSelect,
      });
      if (!profile) {
        throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found.");
      }
      return { profile };
    },
  );

  server.get(
    "/v1/profiles/by-handle/:handle",
    {
      schema: {
        params: z.object({ handle: handleSchema }),
        response: {
          200: profileResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const profile = await database.profile.findUnique({
        where: { handle: request.params.handle },
        select: publicSelect,
      });
      if (!profile) {
        throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found.");
      }
      return { profile };
    },
  );

  server.post(
    "/v1/logout-all",
    {
      preHandler: requireAuthentication,
      schema: {
        response: {
          200: z.object({ success: z.literal(true) }),
          ...securedErrors,
        },
      },
    },
    async (request, reply) => {
      const headers = fromNodeHeaders(request.headers);
      await app.auth.api.revokeOtherSessions({ headers });
      const result = await app.auth.api.signOut({
        headers,
        returnHeaders: true,
      });
      applyResponseCookies(reply, result.headers);
      return { success: true as const };
    },
  );
}
