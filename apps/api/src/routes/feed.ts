import {
  feedQuerySchema,
  feedResponseSchema,
  feedSeenRequestSchema,
} from "@wakyak/contracts";
import type { PrismaClient } from "@wakyak/database";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import type { Env } from "../config/env.js";
import { decodeCursor, encodeCursor } from "../content/cursor.js";
import { postDto } from "../content/dto.js";
import { AppError } from "../errors.js";
import { requireProfile } from "../plugins/authentication.js";
import { errorResponseSchema } from "../schemas.js";
import { blockedProfileIds } from "../social/visibility.js";

function includeFor(profileId: string) {
  return {
    author: {
      select: {
        userId: true,
        handle: true,
        displayName: true,
        avatarUrl: true,
      },
    },
    reactions: { where: { profileId }, select: { value: true } },
    attachments: {
      where: { status: "READY" as const },
      select: { id: true, width: true, height: true, order: true },
      orderBy: { order: "asc" as const },
    },
  };
}

export function registerFeedRoutes(
  app: FastifyInstance,
  database: PrismaClient,
  env: Env,
): void {
  const server = app.withTypeProvider<ZodTypeProvider>();
  server.get(
    "/v1/feed",
    {
      preHandler: requireProfile,
      schema: {
        querystring: feedQuerySchema,
        response: { 200: feedResponseSchema, 400: errorResponseSchema },
      },
    },
    async (request) => {
      const viewerId = request.profile!.userId;
      const { mode, filter, window, limit } = request.query;
      const blocked = await blockedProfileIds(database, viewerId);
      const following =
        mode === "following"
          ? (
              await database.follow.findMany({
                where: { followerProfileId: viewerId },
                select: { followingProfileId: true },
              })
            ).map((row) => row.followingProfileId)
          : [];
      const cursor = decodeCursor<Record<string, unknown>>(
        request.query.cursor,
        { scope: "feed", mode, filter, window },
      );
      const windowMs = {
        day: 86_400_000,
        week: 604_800_000,
        month: 2_592_000_000,
        all: 0,
      }[window];
      const cutoff =
        mode === "top" && window !== "all"
          ? cursor && typeof cursor.cutoff === "string"
            ? new Date(cursor.cutoff)
            : new Date(Date.now() - windowMs)
          : null;
      if (cutoff && Number.isNaN(cutoff.valueOf()))
        throw new AppError(400, "VALIDATION_ERROR", "Invalid cursor.");
      const position: Record<string, unknown> = {};
      if (cursor) {
        const id = typeof cursor.id === "string" ? cursor.id : "";
        if (!id) throw new AppError(400, "VALIDATION_ERROR", "Invalid cursor.");
        if (mode === "hot") {
          const hotRank = Number(cursor.hotRank);
          if (!Number.isFinite(hotRank))
            throw new AppError(400, "VALIDATION_ERROR", "Invalid cursor.");
          Object.assign(position, {
            OR: [{ hotRank: { lt: hotRank } }, { hotRank, id: { lt: id } }],
          });
        } else if (mode === "top") {
          const netScore = Number(cursor.netScore);
          const createdAt = new Date(String(cursor.createdAt));
          if (!Number.isInteger(netScore) || Number.isNaN(createdAt.valueOf()))
            throw new AppError(400, "VALIDATION_ERROR", "Invalid cursor.");
          Object.assign(position, {
            OR: [
              { netScore: { lt: netScore } },
              { netScore, createdAt: { lt: createdAt } },
              { netScore, createdAt, id: { lt: id } },
            ],
          });
        } else {
          const createdAt = new Date(String(cursor.createdAt));
          if (Number.isNaN(createdAt.valueOf()))
            throw new AppError(400, "VALIDATION_ERROR", "Invalid cursor.");
          Object.assign(position, {
            OR: [
              { createdAt: { lt: createdAt } },
              { createdAt, id: { lt: id } },
            ],
          });
        }
      }
      const rows = await database.post.findMany({
        where: {
          AND: [
            { status: "ACTIVE" },
            blocked.length
              ? {
                  OR: [
                    { authorProfileId: null },
                    { authorProfileId: { notIn: blocked } },
                  ],
                }
              : {},
            filter === "unread"
              ? { seenBy: { none: { profileId: viewerId } } }
              : {},
            cutoff ? { createdAt: { gte: cutoff } } : {},
            mode === "following"
              ? {
                  authorProfileId: { in: following, not: viewerId },
                  isAnonymous: false,
                }
              : {},
            position,
          ],
        },
        orderBy:
          mode === "hot"
            ? [{ hotRank: "desc" }, { id: "desc" }]
            : mode === "top"
              ? [{ netScore: "desc" }, { createdAt: "desc" }, { id: "desc" }]
              : [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        include: includeFor(viewerId),
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        posts: page.map((post) => postDto(post, viewerId, env)),
        nextCursor:
          rows.length > limit && last
            ? encodeCursor({
                scope: "feed",
                mode,
                filter,
                window,
                ...(cutoff ? { cutoff: cutoff.toISOString() } : {}),
                id: last.id,
                ...(mode === "hot"
                  ? { hotRank: last.hotRank }
                  : { createdAt: last.createdAt.toISOString() }),
                ...(mode === "top" ? { netScore: last.netScore } : {}),
              })
            : null,
      };
    },
  );

  server.put(
    "/v1/feed/seen",
    {
      preHandler: requireProfile,
      schema: {
        body: feedSeenRequestSchema,
        response: { 204: z.null(), 400: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const viewerId = request.profile!.userId;
      const blocked = await blockedProfileIds(database, viewerId);
      const visible = await database.post.findMany({
        where: {
          id: { in: request.body.postIds },
          status: "ACTIVE",
          ...(blocked.length ? { authorProfileId: { notIn: blocked } } : {}),
        },
        select: { id: true },
      });
      if (visible.length) {
        await database.feedSeen.createMany({
          data: visible.map((post) => ({
            profileId: viewerId,
            postId: post.id,
          })),
          skipDuplicates: true,
        });
      }
      return reply.code(204).send(null);
    },
  );
}
