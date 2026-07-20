import {
  blockResponseSchema,
  blockSourceSchema,
  blocksResponseSchema,
  publicAuthorResponseSchema,
  socialListResponseSchema,
} from "@wakyak/contracts";
import type { PrismaClient } from "@wakyak/database";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import type { Env } from "../config/env.js";
import { anonymousIdentity } from "../content/anonymity.js";
import { AppError } from "../errors.js";
import { handleSchema, userIdSchema } from "../profile-validation.js";
import { requireProfile } from "../plugins/authentication.js";
import { errorResponseSchema } from "../schemas.js";
import { profilesAreBlocked } from "../social/visibility.js";

const publicSelect = {
  userId: true,
  handle: true,
  displayName: true,
  avatarUrl: true,
} as const;
type Snapshot = {
  label: string;
  emoji: string | null;
  color: string | null;
  paletteVersion: string | null;
};

export function registerSocialRoutes(
  app: FastifyInstance,
  database: PrismaClient,
  env: Env,
): void {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.put(
    "/v1/follows/:handle",
    {
      preHandler: requireProfile,
      schema: {
        params: z.object({ handle: handleSchema }),
        response: {
          200: publicAuthorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const followerId = request.profile!.userId;
      const target = await database.profile.findUnique({
        where: { handle: request.params.handle },
        select: publicSelect,
      });
      if (!target)
        throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found.");
      if (target.userId === followerId)
        throw new AppError(
          409,
          "FOLLOW_CONFLICT",
          "You cannot follow yourself.",
        );
      if (await profilesAreBlocked(database, followerId, target.userId))
        throw new AppError(
          409,
          "SOCIAL_UNAVAILABLE",
          "That social action is unavailable.",
        );
      await database.$transaction(async (tx) => {
        const follow = await tx.follow.upsert({
          where: {
            followerProfileId_followingProfileId: {
              followerProfileId: followerId,
              followingProfileId: target.userId,
            },
          },
          create: {
            followerProfileId: followerId,
            followingProfileId: target.userId,
          },
          update: {},
        });
        await tx.outboxEvent.upsert({
          where: { dedupeKey: `follow:${follow.id}` },
          create: {
            type: "NEW_FOLLOWER",
            dedupeKey: `follow:${follow.id}`,
            payload: {
              followId: follow.id,
              followerId,
              recipientId: target.userId,
            },
          },
          update: {},
        });
      });
      return { profile: target };
    },
  );

  server.delete(
    "/v1/follows/:handle",
    {
      preHandler: requireProfile,
      schema: {
        params: z.object({ handle: handleSchema }),
        response: { 204: z.null(), 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const target = await database.profile.findUnique({
        where: { handle: request.params.handle },
        select: { userId: true },
      });
      if (!target)
        throw new AppError(404, "PROFILE_NOT_FOUND", "Profile not found.");
      await database.follow.deleteMany({
        where: {
          followerProfileId: request.profile!.userId,
          followingProfileId: target.userId,
        },
      });
      return reply.code(204).send(null);
    },
  );

  server.get(
    "/v1/me/followers",
    {
      preHandler: requireProfile,
      schema: { response: { 200: socialListResponseSchema } },
    },
    async (request) => ({
      profiles: (
        await database.follow.findMany({
          where: { followingProfileId: request.profile!.userId },
          orderBy: { createdAt: "desc" },
          select: { follower: { select: publicSelect } },
        })
      ).map((row) => row.follower),
    }),
  );
  server.get(
    "/v1/me/following",
    {
      preHandler: requireProfile,
      schema: { response: { 200: socialListResponseSchema } },
    },
    async (request) => ({
      profiles: (
        await database.follow.findMany({
          where: { followerProfileId: request.profile!.userId },
          orderBy: { createdAt: "desc" },
          select: { following: { select: publicSelect } },
        })
      ).map((row) => row.following),
    }),
  );

  server.put(
    "/v1/blocks",
    {
      preHandler: requireProfile,
      schema: {
        body: blockSourceSchema,
        response: {
          200: blockResponseSchema,
          400: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const blockerId = request.profile!.userId;
      let blockedId: string | null = null;
      let snapshot: Snapshot | null = null;
      const unavailable = () =>
        new AppError(
          404,
          "BLOCK_TARGET_UNAVAILABLE",
          "That block target is unavailable.",
        );
      if (request.body.sourceType === "post") {
        const post = await database.post.findFirst({
          where: { id: request.body.sourceId, status: "ACTIVE" },
          select: {
            id: true,
            authorProfileId: true,
            isAnonymous: true,
            author: { select: publicSelect },
          },
        });
        if (!post?.authorProfileId) throw unavailable();
        blockedId = post.authorProfileId;
        if (post.isAnonymous) {
          const anon = anonymousIdentity(
            post.id,
            blockedId,
            env.ANONYMITY_SECRET,
          );
          snapshot = {
            label: "Anonymous",
            emoji: anon.emoji,
            color: anon.color,
            paletteVersion: anon.paletteVersion,
          };
        } else
          snapshot = {
            label: post.author?.displayName ?? "Blocked user",
            emoji: null,
            color: null,
            paletteVersion: null,
          };
      } else if (request.body.sourceType === "comment") {
        const comment = await database.comment.findFirst({
          where: { id: request.body.sourceId, post: { status: "ACTIVE" } },
          select: {
            postId: true,
            authorProfileId: true,
            isAnonymous: true,
            author: { select: publicSelect },
          },
        });
        if (!comment?.authorProfileId) throw unavailable();
        blockedId = comment.authorProfileId;
        if (comment.isAnonymous) {
          const anon = anonymousIdentity(
            comment.postId,
            blockedId,
            env.ANONYMITY_SECRET,
          );
          snapshot = {
            label: "Anonymous",
            emoji: anon.emoji,
            color: anon.color,
            paletteVersion: anon.paletteVersion,
          };
        } else
          snapshot = {
            label: comment.author?.displayName ?? "Blocked user",
            emoji: null,
            color: null,
            paletteVersion: null,
          };
      } else if (request.body.sourceType === "notification") {
        const notification = await database.notification.findFirst({
          where: {
            id: request.body.sourceId,
            recipientProfileId: blockerId,
            type: {
              in: ["MENTION", "DIRECT_REPLY", "THREAD_COMMENT", "NEW_FOLLOWER"],
            },
          },
          select: { actorProfileId: true, payload: true },
        });
        if (!notification?.actorProfileId) throw unavailable();
        blockedId = notification.actorProfileId;
        const value = notification.payload as { actor?: Partial<Snapshot> };
        snapshot = {
          label: value.actor?.label ?? "Blocked user",
          emoji: value.actor?.emoji ?? null,
          color: value.actor?.color ?? null,
          paletteVersion: value.actor?.paletteVersion ?? null,
        };
      } else {
        const profile = await database.profile
          .findUnique({
            where: { userId: userIdSchema.parse(request.body.sourceId) },
            select: publicSelect,
          })
          .catch(() => null);
        if (!profile) throw unavailable();
        blockedId = profile.userId;
        snapshot = {
          label: profile.displayName,
          emoji: null,
          color: null,
          paletteVersion: null,
        };
      }
      if (!blockedId || !snapshot) throw unavailable();
      if (blockedId === blockerId)
        throw new AppError(409, "BLOCK_CONFLICT", "You cannot block yourself.");
      const targetId = blockedId;
      const displaySnapshot = snapshot;
      const block = await database.$transaction(async (tx) => {
        const row = await tx.block.upsert({
          where: {
            blockerProfileId_blockedProfileId: {
              blockerProfileId: blockerId,
              blockedProfileId: targetId,
            },
          },
          create: {
            blockerProfileId: blockerId,
            blockedProfileId: targetId,
            sourceType: request.body.sourceType,
            sourceId: request.body.sourceId,
            displaySnapshot,
          },
          update: {},
        });
        await tx.follow.deleteMany({
          where: {
            OR: [
              { followerProfileId: blockerId, followingProfileId: targetId },
              { followerProfileId: targetId, followingProfileId: blockerId },
            ],
          },
        });
        return row;
      });
      return {
        block: {
          blockId: block.id,
          createdAt: block.createdAt.toISOString(),
          displaySnapshot: block.displaySnapshot as Snapshot,
        },
      };
    },
  );

  server.get(
    "/v1/me/blocks",
    {
      preHandler: requireProfile,
      schema: { response: { 200: blocksResponseSchema } },
    },
    async (request) => ({
      blocks: (
        await database.block.findMany({
          where: { blockerProfileId: request.profile!.userId },
          orderBy: { createdAt: "desc" },
          select: { id: true, createdAt: true, displaySnapshot: true },
        })
      ).map((row) => ({
        blockId: row.id,
        createdAt: row.createdAt.toISOString(),
        displaySnapshot: row.displaySnapshot as Snapshot,
      })),
    }),
  );

  server.delete(
    "/v1/blocks/:blockId",
    {
      preHandler: requireProfile,
      schema: {
        params: z.object({ blockId: z.uuid() }),
        response: { 204: z.null(), 404: errorResponseSchema },
      },
    },
    async (request, reply) => {
      const deleted = await database.block.deleteMany({
        where: {
          id: request.params.blockId,
          blockerProfileId: request.profile!.userId,
        },
      });
      if (!deleted.count)
        throw new AppError(404, "BLOCK_NOT_FOUND", "Block not found.");
      return reply.code(204).send(null);
    },
  );
}
