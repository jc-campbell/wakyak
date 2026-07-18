import type { PrismaClient } from "@wakyak/database";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import type { Env } from "../config/env.js";
import { decodeCursor, encodeCursor } from "../content/cursor.js";
import { postDto } from "../content/dto.js";
import { hotRank } from "../content/ranking.js";
import { contentBody } from "../content/validation.js";
import { AppError } from "../errors.js";
import { requireProfile } from "../plugins/authentication.js";
import { errorResponseSchema } from "../schemas.js";

const idParams = z.object({ id: z.uuid() });
const output = z.any();

function postInclude(profileId: string) {
  return {
    author: { select: { userId: true, handle: true, displayName: true } },
    reactions: { where: { profileId }, select: { value: true } },
    attachments: {
      where: { status: "READY" as const },
      select: { id: true, width: true, height: true, order: true },
      orderBy: { order: "asc" as const },
    },
  };
}

export function registerPostRoutes(
  app: FastifyInstance,
  database: PrismaClient,
  env: Env,
): void {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/v1/posts",
    {
      preHandler: requireProfile,
      schema: {
        body: z.object({
          body: z.string().optional().nullable(),
          isAnonymous: z.boolean().default(false),
          attachmentIds: z.array(z.uuid()).max(4).default([]),
        }),
        response: {
          201: output,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const body = contentBody(request.body.body, false);
      const attachmentIds = request.body.attachmentIds;
      if (!body && attachmentIds.length === 0) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "A post needs text or an attachment.",
        );
      }
      if (new Set(attachmentIds).size !== attachmentIds.length) {
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          "Attachment IDs must be unique.",
        );
      }
      const profileId = request.profile!.userId;
      const now = new Date();
      const post = await database.$transaction(async (tx) => {
        if (attachmentIds.length) {
          const ready = await tx.attachment.count({
            where: {
              id: { in: attachmentIds },
              ownerProfileId: profileId,
              postId: null,
              status: "READY",
              expiresAt: { gt: now },
            },
          });
          if (ready !== attachmentIds.length) {
            throw new AppError(
              409,
              "ATTACHMENT_STATE",
              "Every attachment must be ready, unclaimed, and owned by you.",
            );
          }
        }
        const created = await tx.post.create({
          data: {
            body,
            isAnonymous: request.body.isAnonymous,
            authorProfileId: profileId,
            upvoteCount: 1,
            netScore: 1,
            hotRank: hotRank(1, now),
            createdAt: now,
          },
        });
        await tx.reaction.create({
          data: { profileId, postId: created.id, value: 1 },
        });
        for (const [order, attachmentId] of attachmentIds.entries()) {
          const claimed = await tx.attachment.updateMany({
            where: {
              id: attachmentId,
              ownerProfileId: profileId,
              postId: null,
              status: "READY",
              expiresAt: { gt: now },
            },
            data: { postId: created.id, order },
          });
          if (claimed.count !== 1)
            throw new AppError(
              409,
              "ATTACHMENT_STATE",
              "An attachment was claimed concurrently.",
            );
        }
        return tx.post.findUniqueOrThrow({
          where: { id: created.id },
          include: postInclude(profileId),
        });
      });
      return reply.code(201).send({ post: postDto(post, profileId, env) });
    },
  );

  server.get(
    "/v1/posts",
    {
      preHandler: requireProfile,
      schema: {
        querystring: z.object({
          sort: z.enum(["new", "top", "hot"]).default("hot"),
          window: z.enum(["day", "week", "month", "all"]).default("week"),
          cursor: z.string().optional(),
          limit: z.coerce.number().int().min(1).max(50).default(25),
        }),
        response: {
          200: output,
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const { sort, window, limit } = request.query;
      const cursor = decodeCursor<Record<string, unknown>>(
        request.query.cursor,
        { scope: "posts", sort, window },
      );
      const windowMs = {
        day: 86_400_000,
        week: 604_800_000,
        month: 2_592_000_000,
        all: 0,
      }[window];
      const cutoff =
        sort === "top" && window !== "all"
          ? cursor && typeof cursor.cutoff === "string"
            ? new Date(cursor.cutoff)
            : new Date(Date.now() - windowMs)
          : null;
      if (cutoff && Number.isNaN(cutoff.valueOf()))
        throw new AppError(400, "VALIDATION_ERROR", "Invalid cursor.");

      const baseWhere = {
        status: "ACTIVE" as const,
        ...(cutoff ? { createdAt: { gte: cutoff } } : {}),
      };
      let position = {};
      if (cursor) {
        const id = typeof cursor.id === "string" ? cursor.id : "";
        if (!id) throw new AppError(400, "VALIDATION_ERROR", "Invalid cursor.");
        if (sort === "new") {
          const createdAt = new Date(String(cursor.createdAt));
          position = {
            OR: [
              { createdAt: { lt: createdAt } },
              { createdAt, id: { lt: id } },
            ],
          };
        } else if (sort === "hot") {
          const rank = Number(cursor.hotRank);
          if (!Number.isFinite(rank))
            throw new AppError(400, "VALIDATION_ERROR", "Invalid cursor.");
          position = {
            OR: [{ hotRank: { lt: rank } }, { hotRank: rank, id: { lt: id } }],
          };
        } else {
          const score = Number(cursor.netScore);
          const createdAt = new Date(String(cursor.createdAt));
          if (!Number.isInteger(score) || Number.isNaN(createdAt.valueOf()))
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
          : sort === "hot"
            ? [{ hotRank: "desc" as const }, { id: "desc" as const }]
            : [
                { netScore: "desc" as const },
                { createdAt: "desc" as const },
                { id: "desc" as const },
              ];
      const rows = await database.post.findMany({
        where: { AND: [baseWhere, position] },
        orderBy,
        take: limit + 1,
        include: postInclude(request.profile!.userId),
      });
      const hasMore = rows.length > limit;
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      const nextCursor =
        hasMore && last
          ? encodeCursor({
              scope: "posts",
              sort,
              window,
              ...(cutoff ? { cutoff: cutoff.toISOString() } : {}),
              id: last.id,
              ...(sort === "hot" ? { hotRank: last.hotRank } : {}),
              ...(sort !== "hot"
                ? { createdAt: last.createdAt.toISOString() }
                : {}),
              ...(sort === "top" ? { netScore: last.netScore } : {}),
            })
          : null;
      return {
        posts: page.map((post) => postDto(post, request.profile!.userId, env)),
        nextCursor,
      };
    },
  );

  server.get(
    "/v1/posts/:id",
    {
      preHandler: requireProfile,
      schema: {
        params: idParams,
        response: { 200: output, 404: errorResponseSchema },
      },
    },
    async (request) => {
      const post = await database.post.findFirst({
        where: { id: request.params.id, status: "ACTIVE" },
        include: postInclude(request.profile!.userId),
      });
      if (!post)
        throw new AppError(404, "CONTENT_NOT_FOUND", "Post not found.");
      return { post: postDto(post, request.profile!.userId, env) };
    },
  );

  server.delete(
    "/v1/posts/:id",
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
      const post = await database.post.findUnique({
        where: { id: request.params.id },
        select: { authorProfileId: true, status: true },
      });
      if (!post || post.status !== "ACTIVE")
        throw new AppError(404, "CONTENT_NOT_FOUND", "Post not found.");
      const mine = post.authorProfileId === request.profile!.userId;
      const owner =
        request.authSession!.user.email.trim().toLowerCase() ===
        env.SITE_OWNER_EMAIL;
      if (!mine && !owner)
        throw new AppError(403, "FORBIDDEN", "You cannot delete this post.");
      const now = new Date();
      await database.$transaction([
        database.post.update({
          where: { id: request.params.id },
          data: mine
            ? { status: "DELETED", body: null, deletedAt: now, commentCount: 0 }
            : {
                status: "REMOVED",
                body: null,
                removedAt: now,
                removedByProfileId: request.profile!.userId,
                commentCount: 0,
              },
        }),
        database.attachment.updateMany({
          where: { postId: request.params.id },
          data: { expiresAt: now },
        }),
      ]);
      return reply.code(204).send(null);
    },
  );
}
