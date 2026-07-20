import { prisma } from "@wakyak/database";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  processOutboxEvents,
  runScheduledNotificationJobs,
} from "../src/notifications/worker.js";
import {
  cleanDatabase,
  createTestApp,
  login,
  registerAndVerify,
  testEnv,
} from "./helpers.js";

let app: FastifyInstance;
let emailService: Awaited<ReturnType<typeof createTestApp>>["email"];

beforeEach(async () => {
  await cleanDatabase();
  ({ app, email: emailService } = await createTestApp());
});
afterEach(async () => app.close());

async function user(
  email: string,
  userId: string,
  handle: string,
): Promise<string> {
  await registerAndVerify(app, emailService, email);
  const cookie = await login(app, email);
  const response = await app.inject({
    method: "POST",
    url: "/v1/profile",
    headers: { cookie },
    payload: { userId, handle, displayName: userId },
  });
  expect(response.statusCode).toBe(201);
  return cookie;
}

async function post(
  cookie: string,
  body: string,
  isAnonymous: boolean,
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/v1/posts",
    headers: { cookie },
    payload: { body, isAnonymous },
  });
  expect(response.statusCode).toBe(201);
  return response.json<{ post: { id: string } }>().post.id;
}

describe("API v1 foundations", () => {
  it("follows by handle, filters the following feed, and blocks an anonymous author opaquely", async () => {
    const author = await user(
      "author-v1@example.com",
      "author-v1",
      "author_v1",
    );
    const viewer = await user(
      testEnv.SITE_OWNER_EMAIL,
      "viewer-v1",
      "viewer_v1",
    );
    const identifiedId = await post(author, "identified", false);
    const anonymousId = await post(author, "anonymous", true);

    const followed = await app.inject({
      method: "PUT",
      url: "/v1/follows/@AUTHOR_V1",
      headers: { cookie: viewer },
    });
    expect(followed.statusCode).toBe(200);
    const feed = await app.inject({
      method: "GET",
      url: "/v1/feed?mode=following",
      headers: { cookie: viewer },
    });
    expect(feed.statusCode).toBe(200);
    expect(
      feed.json<{ posts: { id: string }[] }>().posts.map((item) => item.id),
    ).toEqual([identifiedId]);

    const blocked = await app.inject({
      method: "PUT",
      url: "/v1/blocks",
      headers: { cookie: viewer },
      payload: { sourceType: "post", sourceId: anonymousId },
    });
    expect(blocked.statusCode).toBe(200);
    expect(blocked.body).not.toContain("author-v1");
    expect(blocked.body).not.toContain("author_v1");
    expect(blocked.json()).toMatchObject({
      block: { displaySnapshot: { label: "Anonymous" } },
    });
    expect(await prisma.follow.count()).toBe(0);

    const hidden = await app.inject({
      method: "GET",
      url: "/v1/feed?mode=new",
      headers: { cookie: viewer },
    });
    expect(
      hidden.json<{ posts: { id: string }[] }>().posts.map((item) => item.id),
    ).not.toContain(identifiedId);
    const blocks = await app.inject({
      method: "GET",
      url: "/v1/me/blocks",
      headers: { cookie: viewer },
    });
    expect(blocks.body).not.toContain("author-v1");
    const blockId = blocks.json<{ blocks: { blockId: string }[] }>().blocks[0]!
      .blockId;
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/v1/blocks/${blockId}`,
          headers: { cookie: viewer },
        })
      ).statusCode,
    ).toBe(204);
    expect(await prisma.follow.count()).toBe(0);
  });

  it("tracks exact seen posts and creates actor-safe thread notifications", async () => {
    const owner = await user(
      testEnv.SITE_OWNER_EMAIL,
      "notify-owner",
      "notify_owner",
    );
    const commenter = await user(
      "commenter-v1@example.com",
      "notify-commenter",
      "notify_commenter",
    );
    const postId = await post(owner, "thread", false);
    const initial = await app.inject({
      method: "GET",
      url: "/v1/feed?mode=new",
      headers: { cookie: owner },
    });
    expect(
      initial.json<{ posts: { id: string }[] }>().posts.map((item) => item.id),
    ).toContain(postId);
    expect(
      (
        await app.inject({
          method: "PUT",
          url: "/v1/feed/seen",
          headers: { cookie: owner },
          payload: { postIds: [postId] },
        })
      ).statusCode,
    ).toBe(204);
    const newerId = await post(commenter, "newer", false);
    const unread = await app.inject({
      method: "GET",
      url: "/v1/feed?mode=hot&filter=unread",
      headers: { cookie: owner },
    });
    expect(
      unread.json<{ posts: { id: string }[] }>().posts.map((item) => item.id),
    ).toContain(newerId);
    expect(
      unread.json<{ posts: { id: string }[] }>().posts.map((item) => item.id),
    ).not.toContain(postId);

    const comment = await app.inject({
      method: "POST",
      url: `/v1/posts/${postId}/comments`,
      headers: { cookie: commenter },
      payload: { body: "anonymous reply", isAnonymous: true },
    });
    expect(comment.statusCode).toBe(201);
    await processOutboxEvents(prisma, testEnv);
    const notifications = await app.inject({
      method: "GET",
      url: "/v1/notifications",
      headers: { cookie: owner },
    });
    const item = notifications
      .json<{
        notifications: { id: string; type: string; payload: unknown }[];
      }>()
      .notifications.find((value) => value.type === "DIRECT_REPLY");
    expect(item).toBeTruthy();
    expect(JSON.stringify(item!.payload)).not.toContain("notify_commenter");

    await app.inject({
      method: "PUT",
      url: `/v1/posts/${postId}/subscription`,
      headers: { cookie: commenter },
      payload: { enabled: false },
    });
    await app.inject({
      method: "POST",
      url: `/v1/posts/${postId}/comments`,
      headers: { cookie: commenter },
      payload: { body: "another reply", isAnonymous: true },
    });
    expect(
      await prisma.threadSubscription.findUniqueOrThrow({
        where: {
          profileId_postId: {
            profileId: "notify-commenter",
            postId,
          },
        },
      }),
    ).toMatchObject({ enabled: false });

    const blocked = await app.inject({
      method: "PUT",
      url: "/v1/blocks",
      headers: { cookie: owner },
      payload: { sourceType: "notification", sourceId: item!.id },
    });
    expect(blocked.statusCode).toBe(200);
    expect(blocked.body).not.toContain("notify-commenter");
    expect(blocked.body).not.toContain("notify_commenter");
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/notifications",
          headers: { cookie: owner },
        })
      ).json<{ notifications: unknown[] }>().notifications,
    ).toHaveLength(0);

    const settings = await app.inject({
      method: "PATCH",
      url: "/v1/settings",
      headers: { cookie: owner },
      payload: { notifyThreadComments: false, defaultPostAnonymous: false },
    });
    expect(settings.json()).toMatchObject({
      settings: { notifyThreadComments: false, defaultPostAnonymous: false },
    });
    const composed = await app.inject({
      method: "POST",
      url: "/v1/posts",
      headers: { cookie: owner },
      payload: { body: "uses my identified default" },
    });
    expect(composed.json()).toMatchObject({
      post: { isAnonymous: false, author: { handle: "notify_owner" } },
    });
  });

  it("awards score thresholds once and runs the internal trending schedule once per post", async () => {
    const owner = await user(
      testEnv.SITE_OWNER_EMAIL,
      "score-owner",
      "score_owner",
    );
    const postId = await post(owner, "score me", false);
    await prisma.post.update({
      where: { id: postId },
      data: { upvoteCount: 250, downvoteCount: 0, netScore: 250 },
    });
    await prisma.outboxEvent.create({
      data: {
        type: "POST_SCORE_CHANGED",
        dedupeKey: "score-test-250",
        payload: { postId },
      },
    });
    await processOutboxEvents(prisma, testEnv);
    expect(
      (
        await prisma.postMilestone.findMany({
          where: { postId },
          orderBy: { threshold: "asc" },
        })
      ).map((item) => item.threshold),
    ).toEqual([10, 25, 50, 100, 200]);

    await prisma.post.update({
      where: { id: postId },
      data: {
        upvoteCount: 300,
        netScore: 300,
        createdAt: new Date("2026-01-15T22:00:00.000Z"),
      },
    });
    await prisma.outboxEvent.create({
      data: {
        type: "POST_SCORE_CHANGED",
        dedupeKey: "score-test-300",
        payload: { postId },
      },
    });
    await processOutboxEvents(prisma, testEnv);
    expect(
      await prisma.notification.count({
        where: { postId, type: "SCORE_MILESTONE" },
      }),
    ).toBe(6);

    const scheduledAt = new Date("2026-01-15T23:00:00.000Z");
    await runScheduledNotificationJobs(prisma, scheduledAt);
    await runScheduledNotificationJobs(prisma, scheduledAt);
    expect(await prisma.postTrendAward.count({ where: { postId } })).toBe(1);
    expect(
      await prisma.notification.count({
        where: { postId, type: "POST_TRENDING" },
      }),
    ).toBe(1);
  });
});
