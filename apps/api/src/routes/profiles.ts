import { Prisma, type PrismaClient } from "@wakyak/database";
import {
  profileCommentsResponseSchema,
  profileMediaResponseSchema,
  profilePostsResponseSchema,
} from "@wakyak/contracts";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { AppError } from "../errors.js";
import {
  createProfileBodySchema,
  updateProfileBodySchema,
  userIdSchema,
} from "../profile-validation.js";
import {
  errorResponseSchema,
  profileDetailsResponseSchema,
  meResponseSchema,
  profileResponseSchema,
} from "../schemas.js";
import {
  requireAuthentication,
  requireProfile,
} from "../plugins/authentication.js";
import { postDto, commentDto } from "../content/dto.js";
import { decodeCursor, encodeCursor } from "../content/cursor.js";
import { profilesAreBlocked } from "../social/visibility.js";

const publicSelect = {
  userId: true,
  handle: true,
  displayName: true,
  avatarUrl: true,
  bio: true,
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
      return {
        user: authUser,
        profile,
      };
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
        const profile = await database.$transaction(async (tx) => {
          const created = await tx.profile.create({
            data: { ...request.body, authUserId: request.authSession!.user.id },
            select: publicSelect,
          });
          await tx.profileSettings.create({
            data: { profileId: created.userId },
          });
          return created;
        });
        return reply.code(201).send({ profile });
      } catch (error) {
        mapCreateConflict(error);
      }
    },
  );

  server.patch(
    "/v1/me/profile",
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
          ...(request.body.avatarUrl === undefined
            ? {}
            : { avatarUrl: request.body.avatarUrl }),
          ...(request.body.bio === undefined ? {} : { bio: request.body.bio }),
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
      preHandler: requireProfile,
      schema: {
        params: z.object({ userId: userIdSchema }),
        response: {
          200: profileDetailsResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request) => {
      if (
        request.params.userId !== request.profile!.userId &&
        (await profilesAreBlocked(
          database,
          request.profile!.userId,
          request.params.userId,
        ))
      )
        throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found.");
      const profile = await database.profile.findUnique({
        where: { userId: request.params.userId },
        select: publicSelect,
      });
      if (!profile) {
        throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found.");
      }
      const [postCounts, commentCounts, followers, following] =
        await Promise.all([
          database.post.aggregate({
            where: { authorProfileId: profile.userId, status: "ACTIVE" },
            _count: true,
            _sum: { netScore: true },
          }),
          database.comment.aggregate({
            where: {
              authorProfileId: profile.userId,
              status: "ACTIVE",
              post: { status: "ACTIVE" },
            },
            _sum: { netScore: true },
          }),
          database.follow.count({
            where: { followingProfileId: profile.userId },
          }),
          database.follow.count({
            where: { followerProfileId: profile.userId },
          }),
        ]);
      const postWakarma = postCounts._sum.netScore ?? 0;
      const commentWakarma = commentCounts._sum.netScore ?? 0;
      const viewerIsFollowing =
        profile.userId !== request.profile!.userId &&
        Boolean(
          await database.follow.findUnique({
            where: {
              followerProfileId_followingProfileId: {
                followerProfileId: request.profile!.userId,
                followingProfileId: profile.userId,
              },
            },
            select: { id: true },
          }),
        );
      return {
        profile: {
          ...profile,
          counts: { posts: postCounts._count, followers, following },
          wakarma: {
            total: postWakarma + commentWakarma,
            posts: postWakarma,
            comments: commentWakarma,
          },
          viewerIsFollowing,
        },
      };
    },
  );

  const contentQuery = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  });
  const pagePosition = (cursorValue: string | undefined, scope: string) => {
    const cursor = decodeCursor<Record<string, unknown>>(cursorValue, {
      scope,
    });
    if (!cursor) return {};
    const createdAt = new Date(String(cursor.createdAt));
    const id = typeof cursor.id === "string" ? cursor.id : "";
    if (!id || Number.isNaN(createdAt.valueOf()))
      throw new AppError(400, "VALIDATION_ERROR", "Invalid cursor.");
    return {
      OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
    };
  };
  server.get(
    "/v1/profiles/:userId/posts",
    {
      preHandler: requireProfile,
      schema: {
        params: z.object({ userId: userIdSchema }),
        querystring: contentQuery,
        response: {
          200: profilePostsResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      if (
        request.params.userId !== request.profile!.userId &&
        (await profilesAreBlocked(
          database,
          request.profile!.userId,
          request.params.userId,
        ))
      )
        throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found.");
      const scope = `profile:${request.params.userId}:posts`;
      const position = pagePosition(request.query.cursor, scope);
      const rows = await database.post.findMany({
        where: {
          AND: [
            {
              authorProfileId: request.params.userId,
              status: "ACTIVE",
              isAnonymous: false,
            },
            position,
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: request.query.limit + 1,
        include: {
          author: {
            select: {
              userId: true,
              handle: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          reactions: {
            where: { profileId: request.profile!.userId },
            select: { value: true },
          },
          attachments: {
            where: { status: "READY" },
            select: { id: true, width: true, height: true, order: true },
            orderBy: { order: "asc" },
          },
        },
      });
      const posts = rows.slice(0, request.query.limit);
      const last = posts.at(-1);
      return {
        posts: posts.map((post) =>
          postDto(post, request.profile!.userId, app.env),
        ),
        nextCursor:
          rows.length > request.query.limit && last
            ? encodeCursor({
                scope,
                createdAt: last.createdAt.toISOString(),
                id: last.id,
              })
            : null,
      };
    },
  );
  server.get(
    "/v1/profiles/:userId/comments",
    {
      preHandler: requireProfile,
      schema: {
        params: z.object({ userId: userIdSchema }),
        querystring: contentQuery,
        response: {
          200: profileCommentsResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      if (
        request.params.userId !== request.profile!.userId &&
        (await profilesAreBlocked(
          database,
          request.profile!.userId,
          request.params.userId,
        ))
      )
        throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found.");
      const scope = `profile:${request.params.userId}:comments`;
      const position = pagePosition(request.query.cursor, scope);
      const rows = await database.comment.findMany({
        where: {
          AND: [
            {
              authorProfileId: request.params.userId,
              status: "ACTIVE",
              isAnonymous: false,
              post: { status: "ACTIVE" },
            },
            position,
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: request.query.limit + 1,
        include: {
          author: {
            select: {
              userId: true,
              handle: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          reactions: {
            where: { profileId: request.profile!.userId },
            select: { value: true },
          },
          post: { select: { authorProfileId: true } },
        },
      });
      const comments = rows.slice(0, request.query.limit);
      const last = comments.at(-1);
      return {
        comments: comments.map((comment) =>
          commentDto(comment, request.profile!.userId, app.env),
        ),
        nextCursor:
          rows.length > request.query.limit && last
            ? encodeCursor({
                scope,
                createdAt: last.createdAt.toISOString(),
                id: last.id,
              })
            : null,
      };
    },
  );
  server.get(
    "/v1/profiles/:userId/media",
    {
      preHandler: requireProfile,
      schema: {
        params: z.object({ userId: userIdSchema }),
        querystring: contentQuery,
        response: {
          200: profileMediaResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      if (
        request.params.userId !== request.profile!.userId &&
        (await profilesAreBlocked(
          database,
          request.profile!.userId,
          request.params.userId,
        ))
      )
        throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found.");
      const scope = `profile:${request.params.userId}:media`;
      const position = pagePosition(request.query.cursor, scope);
      const rows = await database.attachment.findMany({
        where: {
          AND: [
            {
              status: "READY",
              post: {
                authorProfileId: request.params.userId,
                status: "ACTIVE",
                isAnonymous: false,
              },
            },
            position,
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: request.query.limit + 1,
        select: {
          id: true,
          postId: true,
          width: true,
          height: true,
          createdAt: true,
        },
      });
      const page = rows.slice(0, request.query.limit);
      const last = page.at(-1);
      return {
        attachments: page
          .filter(
            (item): item is typeof item & { postId: string } =>
              item.postId !== null,
          )
          .map((item) => ({
            id: item.id,
            postId: item.postId,
            width: item.width,
            height: item.height,
            url: `/v1/attachments/${item.id}/content`,
          })),
        nextCursor:
          rows.length > request.query.limit && last
            ? encodeCursor({
                scope,
                createdAt: last.createdAt.toISOString(),
                id: last.id,
              })
            : null,
      };
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
