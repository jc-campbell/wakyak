import {
  notificationReadResponseSchema,
  notificationsQuerySchema,
  notificationsReadAllResponseSchema,
  notificationsResponseSchema,
  threadSubscriptionRequestSchema,
  threadSubscriptionSchema,
  type NotificationActor,
  type NotificationDto,
} from "@wakyak/contracts";
import type { PrismaClient } from "@wakyak/database";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import { decodeCursor, encodeCursor } from "../content/cursor.js";
import { AppError } from "../errors.js";
import { requireProfile } from "../plugins/authentication.js";
import { errorResponseSchema } from "../schemas.js";
import { blockedProfileIds } from "../social/visibility.js";

type StoredActor = {
  label?: unknown;
  userId?: unknown;
  handle?: unknown;
  avatarUrl?: unknown;
  emoji?: unknown;
  color?: unknown;
  paletteVersion?: unknown;
};

function actorDto(value: StoredActor): NotificationActor {
  if (
    typeof value.userId === "string" &&
    typeof value.handle === "string" &&
    typeof value.label === "string"
  ) {
    return {
      kind: "identified",
      profile: {
        userId: value.userId,
        handle: value.handle,
        displayName: value.label,
        avatarUrl: typeof value.avatarUrl === "string" ? value.avatarUrl : null,
      },
    };
  }
  return {
    kind: "anonymous",
    identity: {
      emoji: typeof value.emoji === "string" ? value.emoji : "•",
      color: typeof value.color === "string" ? value.color : "#57534e",
      paletteVersion:
        typeof value.paletteVersion === "string" ? value.paletteVersion : "v1",
    },
  };
}

function notificationDto(row: {
  id: string;
  type: string;
  postId: string | null;
  commentId: string | null;
  payload: unknown;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDto {
  const value = row.payload as Record<string, unknown>;
  const common = {
    id: row.id,
    postId: row.postId,
    commentId: row.commentId,
    readAt: row.readAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
  if (
    row.type === "MENTION" ||
    row.type === "DIRECT_REPLY" ||
    row.type === "THREAD_COMMENT"
  ) {
    return {
      ...common,
      type: row.type,
      payload: {
        actor: actorDto(value.actor ?? {}),
        excerpt: typeof value.excerpt === "string" ? value.excerpt : "",
      },
    };
  }
  if (row.type === "NEW_FOLLOWER") {
    const actor = actorDto(value.actor ?? {});
    if (actor.kind !== "identified")
      throw new AppError(
        500,
        "INTERNAL_ERROR",
        "Notification data is invalid.",
      );
    return { ...common, type: "NEW_FOLLOWER", payload: { actor } };
  }
  if (row.type === "SCORE_MILESTONE")
    return {
      ...common,
      type: "SCORE_MILESTONE",
      payload: {
        threshold: Number(value.threshold),
        excerpt: typeof value.excerpt === "string" ? value.excerpt : "",
      },
    };
  if (row.type === "POST_TRENDING")
    return {
      ...common,
      type: "POST_TRENDING",
      payload: {
        excerpt: typeof value.excerpt === "string" ? value.excerpt : "",
      },
    };
  return {
    ...common,
    type: "SYSTEM",
    payload: {
      message:
        typeof value.message === "string" ? value.message : "System update",
    },
  };
}

export function registerNotificationRoutes(
  app: FastifyInstance,
  database: PrismaClient,
): void {
  const server = app.withTypeProvider<ZodTypeProvider>();
  server.get(
    "/v1/notifications",
    {
      preHandler: requireProfile,
      schema: {
        querystring: notificationsQuerySchema,
        response: {
          200: notificationsResponseSchema,
          400: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const profileId = request.profile!.userId;
      const blocked = await blockedProfileIds(database, profileId);
      const cursor = decodeCursor<Record<string, unknown>>(
        request.query.cursor,
        { scope: "notifications", state: request.query.state },
      );
      let position = {};
      if (cursor) {
        const createdAt = new Date(String(cursor.createdAt));
        const id = typeof cursor.id === "string" ? cursor.id : "";
        if (!id || Number.isNaN(createdAt.valueOf()))
          throw new AppError(400, "VALIDATION_ERROR", "Invalid cursor.");
        position = {
          OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }],
        };
      }
      const rows = await database.notification.findMany({
        where: {
          AND: [
            { recipientProfileId: profileId },
            request.query.state === "unread" ? { readAt: null } : {},
            blocked.length
              ? {
                  OR: [
                    { actorProfileId: null },
                    { actorProfileId: { notIn: blocked } },
                  ],
                }
              : {},
            position,
          ],
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: request.query.limit + 1,
      });
      const page = rows.slice(0, request.query.limit);
      const last = page.at(-1);
      return {
        notifications: page.map(notificationDto),
        nextCursor:
          rows.length > request.query.limit && last
            ? encodeCursor({
                scope: "notifications",
                state: request.query.state,
                id: last.id,
                createdAt: last.createdAt.toISOString(),
              })
            : null,
      };
    },
  );
  server.put(
    "/v1/notifications/:id/read",
    {
      preHandler: requireProfile,
      schema: {
        params: z.object({ id: z.uuid() }),
        response: {
          200: notificationReadResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const now = new Date();
      const result = await database.notification.updateMany({
        where: {
          id: request.params.id,
          recipientProfileId: request.profile!.userId,
        },
        data: { readAt: now },
      });
      if (!result.count)
        throw new AppError(
          404,
          "NOTIFICATION_NOT_FOUND",
          "Notification not found.",
        );
      return { readAt: now.toISOString() };
    },
  );
  server.put(
    "/v1/notifications/read-all",
    {
      preHandler: requireProfile,
      schema: {
        response: {
          200: notificationsReadAllResponseSchema,
        },
      },
    },
    async (request) => {
      const now = new Date();
      const result = await database.notification.updateMany({
        where: { recipientProfileId: request.profile!.userId, readAt: null },
        data: { readAt: now },
      });
      return { readAt: now.toISOString(), count: result.count };
    },
  );
  server.get(
    "/v1/posts/:postId/subscription",
    {
      preHandler: requireProfile,
      schema: {
        params: z.object({ postId: z.uuid() }),
        response: {
          200: threadSubscriptionSchema,
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
      const subscription = await database.threadSubscription.findUnique({
        where: {
          profileId_postId: {
            profileId: request.profile!.userId,
            postId: post.id,
          },
        },
      });
      return { enabled: subscription?.enabled ?? false };
    },
  );
  server.put(
    "/v1/posts/:postId/subscription",
    {
      preHandler: requireProfile,
      schema: {
        params: z.object({ postId: z.uuid() }),
        body: threadSubscriptionRequestSchema,
        response: {
          200: threadSubscriptionSchema,
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
      const subscription = await database.threadSubscription.upsert({
        where: {
          profileId_postId: {
            profileId: request.profile!.userId,
            postId: post.id,
          },
        },
        create: {
          profileId: request.profile!.userId,
          postId: post.id,
          enabled: request.body.enabled,
        },
        update: { enabled: request.body.enabled },
      });
      return { enabled: subscription.enabled };
    },
  );
}
