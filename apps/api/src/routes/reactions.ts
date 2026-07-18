import { Prisma, type PrismaClient } from "@wakyak/database";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { hotRank } from "../content/ranking.js";
import { AppError } from "../errors.js";
import { requireProfile } from "../plugins/authentication.js";
import { errorResponseSchema } from "../schemas.js";

const params = z.object({ id: z.uuid() });
const response = z.object({
  viewerReaction: z.union([z.literal(-1), z.literal(1)]).nullable(),
  netScore: z.number().int(),
});

function deltas(oldValue: number | null, newValue: number | null) {
  return {
    up: Number(newValue === 1) - Number(oldValue === 1),
    down: Number(newValue === -1) - Number(oldValue === -1),
  };
}

export function registerReactionRoutes(
  app: FastifyInstance,
  database: PrismaClient,
): void {
  const server = app.withTypeProvider<ZodTypeProvider>();

  const mutatePost = async (
    postId: string,
    profileId: string,
    value: -1 | 1 | null,
  ) =>
    database.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Post" WHERE "id" = ${postId} FOR UPDATE`,
      );
      const post = await tx.post.findUnique({
        where: { id: postId },
        select: {
          status: true,
          authorProfileId: true,
          upvoteCount: true,
          downvoteCount: true,
          netScore: true,
          createdAt: true,
        },
      });
      if (!post || post.status !== "ACTIVE")
        throw new AppError(404, "CONTENT_NOT_FOUND", "Post not found.");
      if (value === -1 && post.authorProfileId === profileId)
        throw new AppError(
          409,
          "REACTION_CONFLICT",
          "You cannot downvote your own post.",
        );
      const existing = await tx.reaction.findUnique({
        where: { profileId_postId: { profileId, postId } },
      });
      const change = deltas(existing?.value ?? null, value);
      if (value === null) {
        if (existing) await tx.reaction.delete({ where: { id: existing.id } });
      } else {
        await tx.reaction.upsert({
          where: { profileId_postId: { profileId, postId } },
          create: { profileId, postId, value },
          update: { value },
        });
      }
      const upvoteCount = post.upvoteCount + change.up;
      const downvoteCount = post.downvoteCount + change.down;
      const netScore = upvoteCount - downvoteCount;
      await tx.post.update({
        where: { id: postId },
        data: {
          upvoteCount,
          downvoteCount,
          netScore,
          hotRank: hotRank(netScore, post.createdAt),
        },
      });
      return { viewerReaction: value, netScore };
    });

  const mutateComment = async (
    commentId: string,
    profileId: string,
    value: -1 | 1 | null,
  ) =>
    database.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Comment" WHERE "id" = ${commentId} FOR UPDATE`,
      );
      const comment = await tx.comment.findUnique({
        where: { id: commentId },
        select: {
          status: true,
          authorProfileId: true,
          post: { select: { status: true } },
          upvoteCount: true,
          downvoteCount: true,
        },
      });
      if (
        !comment ||
        comment.status !== "ACTIVE" ||
        comment.post.status !== "ACTIVE"
      )
        throw new AppError(404, "CONTENT_NOT_FOUND", "Comment not found.");
      if (value === -1 && comment.authorProfileId === profileId)
        throw new AppError(
          409,
          "REACTION_CONFLICT",
          "You cannot downvote your own comment.",
        );
      const existing = await tx.reaction.findUnique({
        where: { profileId_commentId: { profileId, commentId } },
      });
      const change = deltas(existing?.value ?? null, value);
      if (value === null) {
        if (existing) await tx.reaction.delete({ where: { id: existing.id } });
      } else {
        await tx.reaction.upsert({
          where: { profileId_commentId: { profileId, commentId } },
          create: { profileId, commentId, value },
          update: { value },
        });
      }
      const upvoteCount = comment.upvoteCount + change.up;
      const downvoteCount = comment.downvoteCount + change.down;
      const netScore = upvoteCount - downvoteCount;
      await tx.comment.update({
        where: { id: commentId },
        data: { upvoteCount, downvoteCount, netScore },
      });
      return { viewerReaction: value, netScore };
    });

  server.put(
    "/v1/posts/:id/reaction",
    {
      preHandler: requireProfile,
      schema: {
        params,
        body: z.object({ value: z.union([z.literal(-1), z.literal(1)]) }),
        response: {
          200: response,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request) =>
      mutatePost(
        request.params.id,
        request.profile!.userId,
        request.body.value,
      ),
  );
  server.delete(
    "/v1/posts/:id/reaction",
    {
      preHandler: requireProfile,
      schema: { params, response: { 200: response, 404: errorResponseSchema } },
    },
    async (request) =>
      mutatePost(request.params.id, request.profile!.userId, null),
  );
  server.put(
    "/v1/comments/:id/reaction",
    {
      preHandler: requireProfile,
      schema: {
        params,
        body: z.object({ value: z.union([z.literal(-1), z.literal(1)]) }),
        response: {
          200: response,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request) =>
      mutateComment(
        request.params.id,
        request.profile!.userId,
        request.body.value,
      ),
  );
  server.delete(
    "/v1/comments/:id/reaction",
    {
      preHandler: requireProfile,
      schema: { params, response: { 200: response, 404: errorResponseSchema } },
    },
    async (request) =>
      mutateComment(request.params.id, request.profile!.userId, null),
  );
}
