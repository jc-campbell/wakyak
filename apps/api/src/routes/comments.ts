import type { PrismaClient } from "@wakyak/database";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import type { Env } from "../config/env.js";
import { decodeCursor, encodeCursor } from "../content/cursor.js";
import { commentDto } from "../content/dto.js";
import { contentBody } from "../content/validation.js";
import { AppError } from "../errors.js";
import { requireProfile } from "../plugins/authentication.js";
import { errorResponseSchema } from "../schemas.js";

const output = z.any();
const idParams = z.object({ id: z.uuid() });
const postParams = z.object({ postId: z.uuid() });

function commentInclude(profileId: string) {
  return {
    author: { select: { userId: true, handle: true, displayName: true } },
    reactions: { where: { profileId }, select: { value: true } },
    post: { select: { authorProfileId: true } },
  };
}

export function registerCommentRoutes(
  app: FastifyInstance,
  database: PrismaClient,
  env: Env,
): void {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/v1/posts/:postId/comments",
    {
      preHandler: requireProfile,
      schema: {
        params: postParams,
        body: z.object({
          body: z.string(),
          isAnonymous: z.boolean().default(false),
          parentCommentId: z.uuid().optional().nullable(),
        }),
        response: {
          201: output,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = contentBody(request.body.body, true)!;
      const profileId = request.profile!.userId;
      const comment = await database.$transaction(async (tx) => {
        const post = await tx.post.findFirst({
          where: { id: request.params.postId, status: "ACTIVE" },
          select: { id: true },
        });
        if (!post)
          throw new AppError(404, "CONTENT_NOT_FOUND", "Post not found.");
        let depth = 0;
        let parentId: string | null = null;
        if (request.body.parentCommentId) {
          const parent = await tx.comment.findFirst({
            where: {
              id: request.body.parentCommentId,
              postId: post.id,
              status: "ACTIVE",
            },
            select: { id: true, depth: true },
          });
          if (!parent)
            throw new AppError(
              409,
              "CONTENT_INACTIVE",
              "The parent comment is missing, inactive, or belongs to another post.",
            );
          parentId = parent.id;
          depth = parent.depth + 1;
        }
        const created = await tx.comment.create({
          data: {
            postId: post.id,
            authorProfileId: profileId,
            body,
            isAnonymous: request.body.isAnonymous,
            parentCommentId: parentId,
            parentPostId: parentId ? post.id : null,
            depth,
            upvoteCount: 1,
            netScore: 1,
          },
        });
        await tx.reaction.create({
          data: { profileId, commentId: created.id, value: 1 },
        });
        await tx.post.update({
          where: { id: post.id },
          data: { commentCount: { increment: 1 } },
        });
        if (parentId)
          await tx.comment.update({
            where: { id: parentId },
            data: { replyCount: { increment: 1 } },
          });
        return tx.comment.findUniqueOrThrow({
          where: { id: created.id },
          include: commentInclude(profileId),
        });
      });
      return reply
        .code(201)
        .send({ comment: commentDto(comment, profileId, env) });
    },
  );

  server.get(
    "/v1/posts/:postId/comments",
    {
      preHandler: requireProfile,
      schema: {
        params: postParams,
        querystring: z.object({
          sort: z.enum(["top", "new"]).default("top"),
          cursor: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(50).default(25),
        }),
        response: {
          200: output,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const post = await database.post.findFirst({
        where: { id: request.params.postId, status: "ACTIVE" },
        select: { id: true },
      });
      if (!post)
        throw new AppError(404, "CONTENT_NOT_FOUND", "Post not found.");
      const { sort, limit } = request.query;
      const cursor = decodeCursor<Record<string, unknown>>(
        request.query.cursor,
        { scope: `post:${post.id}:comments`, sort },
      );
      let position = {};
      if (cursor) {
        const id = typeof cursor.id === "string" ? cursor.id : "";
        const createdAt = new Date(String(cursor.createdAt));
        if (!id || Number.isNaN(createdAt.valueOf()))
          throw new AppError(400, "VALIDATION_ERROR", "Invalid cursor.");
        if (sort === "new")
          position = {
            OR: [
              { createdAt: { lt: createdAt } },
              { createdAt, id: { lt: id } },
            ],
          };
        else {
          const score = Number(cursor.netScore);
          if (!Number.isInteger(score))
            throw new AppError(400, "VALIDATION_ERROR", "Invalid cursor.");
          position = {
            OR: [
              { netScore: { lt: score } },
              { netScore: score, createdAt: { lt: createdAt } },
              { netScore: score, createdAt, id: { lt: id } },
            ],
          };
        }
      }
      const orderBy =
        sort === "new"
          ? [{ createdAt: "desc" as const }, { id: "desc" as const }]
          : [
              { netScore: "desc" as const },
              { createdAt: "desc" as const },
              { id: "desc" as const },
            ];
      const rows = await database.comment.findMany({
        where: { AND: [{ postId: post.id, parentCommentId: null }, position] },
        orderBy,
        take: limit + 1,
        include: commentInclude(request.profile!.userId),
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        comments: page.map((comment) =>
          commentDto(comment, request.profile!.userId, env),
        ),
        nextCursor:
          rows.length > limit && last
            ? encodeCursor({
                scope: `post:${post.id}:comments`,
                sort,
                id: last.id,
                createdAt: last.createdAt.toISOString(),
                ...(sort === "top" ? { netScore: last.netScore } : {}),
              })
            : null,
      };
    },
  );

  server.get(
    "/v1/comments/:id/replies",
    {
      preHandler: requireProfile,
      schema: {
        params: idParams,
        querystring: z.object({
          cursor: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(50).default(25),
        }),
        response: {
          200: output,
          400: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const parent = await database.comment.findUnique({
        where: { id: request.params.id },
        select: { id: true, post: { select: { status: true } } },
      });
      if (!parent || parent.post.status !== "ACTIVE")
        throw new AppError(404, "CONTENT_NOT_FOUND", "Comment not found.");
      const cursor = decodeCursor<Record<string, unknown>>(
        request.query.cursor,
        { scope: `comment:${parent.id}:replies`, sort: "oldest" },
      );
      let position = {};
      if (cursor) {
        const id = typeof cursor.id === "string" ? cursor.id : "";
        const createdAt = new Date(String(cursor.createdAt));
        if (!id || Number.isNaN(createdAt.valueOf()))
          throw new AppError(400, "VALIDATION_ERROR", "Invalid cursor.");
        position = {
          OR: [{ createdAt: { gt: createdAt } }, { createdAt, id: { gt: id } }],
        };
      }
      const rows = await database.comment.findMany({
        where: { AND: [{ parentCommentId: parent.id }, position] },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: request.query.limit + 1,
        include: commentInclude(request.profile!.userId),
      });
      const page = rows.slice(0, request.query.limit);
      const last = page.at(-1);
      return {
        comments: page.map((comment) =>
          commentDto(comment, request.profile!.userId, env),
        ),
        nextCursor:
          rows.length > request.query.limit && last
            ? encodeCursor({
                scope: `comment:${parent.id}:replies`,
                sort: "oldest",
                id: last.id,
                createdAt: last.createdAt.toISOString(),
              })
            : null,
      };
    },
  );

  server.delete(
    "/v1/comments/:id",
    {
      preHandler: requireProfile,
      schema: {
        params: idParams,
        response: {
          204: z.null(),
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      await database.$transaction(async (tx) => {
        const comment = await tx.comment.findUnique({
          where: { id: request.params.id },
          select: {
            authorProfileId: true,
            status: true,
            postId: true,
            parentCommentId: true,
            post: { select: { status: true } },
          },
        });
        if (
          !comment ||
          comment.status !== "ACTIVE" ||
          comment.post.status !== "ACTIVE"
        )
          throw new AppError(404, "CONTENT_NOT_FOUND", "Comment not found.");
        const mine = comment.authorProfileId === request.profile!.userId;
        const owner =
          request.authSession!.user.email.trim().toLowerCase() ===
          env.SITE_OWNER_EMAIL;
        if (!mine && !owner)
          throw new AppError(
            403,
            "FORBIDDEN",
            "You cannot delete this comment.",
          );
        const now = new Date();
        await tx.comment.update({
          where: { id: request.params.id },
          data: mine
            ? { status: "DELETED", body: null, deletedAt: now }
            : {
                status: "REMOVED",
                body: null,
                removedAt: now,
                removedByProfileId: request.profile!.userId,
              },
        });
        await tx.post.updateMany({
          where: { id: comment.postId, commentCount: { gt: 0 } },
          data: { commentCount: { decrement: 1 } },
        });
        if (comment.parentCommentId)
          await tx.comment.updateMany({
            where: { id: comment.parentCommentId, replyCount: { gt: 0 } },
            data: { replyCount: { decrement: 1 } },
          });
      });
      return reply.code(204).send(null);
    },
  );
}
