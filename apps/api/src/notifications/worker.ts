import type { Prisma, PrismaClient } from "@wakyak/database";

import type { Env } from "../config/env.js";
import { anonymousIdentity } from "../content/anonymity.js";

type JsonObject = Record<string, unknown>;

const settingFor = {
  MENTION: "notifyMentions",
  DIRECT_REPLY: "notifyDirectReplies",
  THREAD_COMMENT: "notifyThreadComments",
  NEW_FOLLOWER: "notifyNewFollowers",
  SCORE_MILESTONE: "notifyScoreMilestones",
  POST_TRENDING: "notifyPostTrending",
} as const;

async function canNotify(
  database: PrismaClient,
  recipientId: string,
  actorId: string | null,
  type: keyof typeof settingFor | "SYSTEM",
): Promise<boolean> {
  if (type === "SYSTEM") return true;
  if (actorId) {
    const blocked = await database.block.count({
      where: {
        OR: [
          { blockerProfileId: recipientId, blockedProfileId: actorId },
          { blockerProfileId: actorId, blockedProfileId: recipientId },
        ],
      },
    });
    if (blocked) return false;
  }
  const settings = await database.profileSettings.upsert({
    where: { profileId: recipientId },
    create: { profileId: recipientId },
    update: {},
  });
  return settings[settingFor[type]];
}

async function createNotification(
  database: PrismaClient,
  input: {
    recipientProfileId: string;
    actorProfileId?: string | null;
    type: keyof typeof settingFor | "SYSTEM";
    postId?: string | null;
    commentId?: string | null;
    payload: JsonObject;
    dedupeKey: string;
  },
): Promise<void> {
  if (
    !(await canNotify(
      database,
      input.recipientProfileId,
      input.actorProfileId ?? null,
      input.type,
    ))
  )
    return;
  await database.notification.upsert({
    where: { dedupeKey: input.dedupeKey },
    update: {},
    create: {
      recipientProfileId: input.recipientProfileId,
      actorProfileId: input.actorProfileId ?? null,
      type: input.type,
      postId: input.postId ?? null,
      commentId: input.commentId ?? null,
      payload: input.payload as Prisma.InputJsonValue,
      dedupeKey: input.dedupeKey,
    },
  });
}

async function processComment(
  database: PrismaClient,
  env: Env,
  commentId: string,
): Promise<void> {
  const comment = await database.comment.findUnique({
    where: { id: commentId },
    include: {
      author: {
        select: {
          userId: true,
          handle: true,
          displayName: true,
          avatarUrl: true,
        },
      },
      parent: { select: { authorProfileId: true } },
      post: { select: { authorProfileId: true } },
    },
  });
  if (
    !comment ||
    comment.status !== "ACTIVE" ||
    !comment.authorProfileId ||
    !comment.author
  )
    return;
  const actorId = comment.authorProfileId;
  const actor = comment.isAnonymous
    ? (() => {
        const value = anonymousIdentity(
          comment.postId,
          actorId,
          env.ANONYMITY_SECRET,
        );
        return { label: "Anonymous", ...value };
      })()
    : {
        label: comment.author.displayName,
        handle: comment.author.handle,
        userId: comment.author.userId,
        avatarUrl: comment.author.avatarUrl,
      };
  const recipients = new Map<
    string,
    "MENTION" | "DIRECT_REPLY" | "THREAD_COMMENT"
  >();
  const handles = [
    ...new Set(
      (comment.body?.match(/(?:^|\s)@([a-z][a-z0-9_]*)/gi) ?? []).map((value) =>
        value.trim().slice(1).toLowerCase(),
      ),
    ),
  ];
  if (handles.length) {
    const mentioned = await database.profile.findMany({
      where: { handle: { in: handles } },
      select: { userId: true },
    });
    for (const profile of mentioned)
      if (profile.userId !== actorId) recipients.set(profile.userId, "MENTION");
  }
  const direct =
    comment.parent?.authorProfileId ??
    (comment.parentCommentId ? null : comment.post.authorProfileId);
  if (direct && direct !== actorId && !recipients.has(direct))
    recipients.set(direct, "DIRECT_REPLY");
  const subscribers = await database.threadSubscription.findMany({
    where: {
      postId: comment.postId,
      enabled: true,
      profileId: { not: actorId },
    },
    select: { profileId: true },
  });
  for (const subscriber of subscribers)
    if (!recipients.has(subscriber.profileId))
      recipients.set(subscriber.profileId, "THREAD_COMMENT");
  for (const [recipientProfileId, type] of recipients)
    await createNotification(database, {
      recipientProfileId,
      actorProfileId: actorId,
      type,
      postId: comment.postId,
      commentId: comment.id,
      payload: { actor, excerpt: comment.body?.slice(0, 160) ?? "" },
      dedupeKey: `comment:${comment.id}:${recipientProfileId}`,
    });
}

function reachedThresholds(score: number): number[] {
  const fixed = [10, 25, 50, 100].filter((value) => value <= score);
  for (let value = 200; value <= score; value += 100) fixed.push(value);
  return fixed;
}

async function processEvent(
  database: PrismaClient,
  env: Env,
  type: string,
  payload: JsonObject,
): Promise<void> {
  if (type === "COMMENT_CREATED" && typeof payload.commentId === "string")
    return processComment(database, env, payload.commentId);
  if (
    type === "NEW_FOLLOWER" &&
    typeof payload.followId === "string" &&
    typeof payload.followerId === "string" &&
    typeof payload.recipientId === "string"
  ) {
    const follower = await database.profile.findUnique({
      where: { userId: payload.followerId },
      select: {
        userId: true,
        handle: true,
        displayName: true,
        avatarUrl: true,
      },
    });
    if (follower)
      await createNotification(database, {
        recipientProfileId: payload.recipientId,
        actorProfileId: follower.userId,
        type: "NEW_FOLLOWER",
        payload: {
          actor: {
            label: follower.displayName,
            handle: follower.handle,
            userId: follower.userId,
            avatarUrl: follower.avatarUrl,
          },
        },
        dedupeKey: `follow:${payload.followId}`,
      });
    return;
  }
  if (type === "POST_SCORE_CHANGED" && typeof payload.postId === "string") {
    const post = await database.post.findUnique({
      where: { id: payload.postId },
      select: {
        id: true,
        status: true,
        authorProfileId: true,
        netScore: true,
        body: true,
      },
    });
    if (!post || post.status !== "ACTIVE" || !post.authorProfileId) return;
    for (const threshold of reachedThresholds(post.netScore)) {
      const awarded = await database.postMilestone.upsert({
        where: { postId_threshold: { postId: post.id, threshold } },
        create: { postId: post.id, threshold },
        update: {},
      });
      await createNotification(database, {
        recipientProfileId: post.authorProfileId,
        type: "SCORE_MILESTONE",
        postId: post.id,
        payload: {
          threshold,
          score: post.netScore,
          excerpt: post.body?.slice(0, 160) ?? "",
        },
        dedupeKey: `post:${post.id}:milestone:${awarded.threshold}`,
      });
    }
  }
}

export async function processOutboxEvents(
  database: PrismaClient,
  env: Env,
  limit = 25,
): Promise<number> {
  const workerId = crypto.randomUUID();
  const now = new Date();
  const stale = new Date(now.valueOf() - 5 * 60_000);
  const candidates = await database.outboxEvent.findMany({
    where: {
      OR: [
        { status: "AVAILABLE", availableAt: { lte: now } },
        { status: "PROCESSING", lockedAt: { lt: stale } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  let processed = 0;
  for (const event of candidates) {
    const claimed = await database.outboxEvent.updateMany({
      where: {
        id: event.id,
        OR: [
          { status: "AVAILABLE" },
          { status: "PROCESSING", lockedAt: { lt: stale } },
        ],
      },
      data: {
        status: "PROCESSING",
        lockedAt: now,
        lockedBy: workerId,
        attempts: { increment: 1 },
      },
    });
    if (!claimed.count) continue;
    try {
      await processEvent(
        database,
        env,
        event.type,
        event.payload as JsonObject,
      );
      await database.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: "PROCESSED",
          processedAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastError: null,
        },
      });
      processed += 1;
    } catch (error) {
      const attempts = event.attempts + 1;
      await database.outboxEvent.update({
        where: { id: event.id },
        data: {
          status: attempts >= 8 ? "FAILED" : "AVAILABLE",
          availableAt: new Date(
            Date.now() + Math.min(60_000, 2 ** attempts * 1_000),
          ),
          lockedAt: null,
          lockedBy: null,
          lastError:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : "Unknown error",
        },
      });
    }
  }
  return processed;
}

function localParts(now: Date): { date: string; hour: number } {
  const entries = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: string) =>
    entries.find((entry) => entry.type === type)?.value ?? "";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    hour: Number(part("hour")),
  };
}

export function notificationSlotAt(date: string, hour: number): Date {
  const [year, month, day] = date.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const desired = Date.UTC(year, month - 1, day, hour);
  const shown = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(desired));
  const part = (type: string) =>
    Number(shown.find((entry) => entry.type === type)?.value ?? "0");
  const displayedAsUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
  );
  return new Date(desired - (displayedAsUtc - desired));
}

export async function runScheduledNotificationJobs(
  database: PrismaClient,
  now = new Date(),
): Promise<void> {
  const local = localParts(now);
  const slots = [9, 18].filter((hour) => local.hour >= hour);
  for (const hour of slots) {
    const jobKey = `trending:${local.date}:${hour}`;
    const scheduledFor = notificationSlotAt(local.date, hour);
    const lockedBy = crypto.randomUUID();
    try {
      await database.scheduledJobRun.create({
        data: { jobKey, scheduledFor, lockedBy },
      });
    } catch {
      continue;
    }
    try {
      const post = await database.post.findFirst({
        where: {
          status: "ACTIVE",
          createdAt: {
            gte: new Date(scheduledFor.valueOf() - 86_400_000),
            lte: scheduledFor,
          },
        },
        orderBy: [{ hotRank: "desc" }, { id: "desc" }],
        select: { id: true, authorProfileId: true, body: true },
      });
      if (
        post?.authorProfileId &&
        !(await database.postTrendAward.findUnique({
          where: { postId: post.id },
        }))
      ) {
        await database.postTrendAward.create({ data: { postId: post.id } });
        await createNotification(database, {
          recipientProfileId: post.authorProfileId,
          type: "POST_TRENDING",
          postId: post.id,
          payload: { excerpt: post.body?.slice(0, 160) ?? "" },
          dedupeKey: `post:${post.id}:trending`,
        });
      }
      await database.scheduledJobRun.update({
        where: { jobKey_scheduledFor: { jobKey, scheduledFor } },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
    } catch (error) {
      await database.scheduledJobRun.update({
        where: { jobKey_scheduledFor: { jobKey, scheduledFor } },
        data: {
          status: "FAILED",
          completedAt: new Date(),
          error:
            error instanceof Error
              ? error.message.slice(0, 1000)
              : "Unknown error",
        },
      });
    }
  }
  const cleanupKey = `notification-retention:${local.date}`;
  const cleanupAt = notificationSlotAt(local.date, 0);
  try {
    await database.scheduledJobRun.create({
      data: {
        jobKey: cleanupKey,
        scheduledFor: cleanupAt,
        lockedBy: crypto.randomUUID(),
      },
    });
  } catch {
    return;
  }
  try {
    await database.notification.deleteMany({
      where: { createdAt: { lt: new Date(now.valueOf() - 90 * 86_400_000) } },
    });
    await database.scheduledJobRun.update({
      where: {
        jobKey_scheduledFor: { jobKey: cleanupKey, scheduledFor: cleanupAt },
      },
      data: { status: "COMPLETED", completedAt: new Date() },
    });
  } catch (error) {
    await database.scheduledJobRun.update({
      where: {
        jobKey_scheduledFor: { jobKey: cleanupKey, scheduledFor: cleanupAt },
      },
      data: {
        status: "FAILED",
        completedAt: new Date(),
        error:
          error instanceof Error
            ? error.message.slice(0, 1000)
            : "Unknown error",
      },
    });
  }
}
