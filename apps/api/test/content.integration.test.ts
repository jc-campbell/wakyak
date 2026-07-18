import { prisma } from "@wakyak/database";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cleanDatabase,
  createTestApp,
  login,
  registerAndVerify,
  testEnv,
} from "./helpers.js";

let app: FastifyInstance;
let emailService: Awaited<ReturnType<typeof createTestApp>>["email"];

interface PostResponse {
  post: {
    id: string;
    body: string | null;
    author: unknown;
    anonymousIdentity: unknown;
    isMine: boolean;
    netScore: number;
    viewerReaction: number | null;
  };
}

interface CommentResponse {
  comment: { id: string; depth: number };
}

interface CommentsResponse {
  comments: {
    id: string;
    body: string | null;
    author: unknown;
    status: string;
    replyCount: number;
  }[];
}

beforeEach(async () => {
  await cleanDatabase();
  ({ app, email: emailService } = await createTestApp());
});
afterEach(async () => app.close());

async function user(email: string, userId: string, handle: string) {
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

describe("content API", () => {
  it("creates anonymous posts, ranks reactions, nests comments, and preserves tombstones", async () => {
    const author = await user(
      "author@example.com",
      "post-author",
      "post_author",
    );
    const viewer = await user(
      testEnv.SITE_OWNER_EMAIL,
      "site-owner",
      "site_owner",
    );
    const created = await app.inject({
      method: "POST",
      url: "/v1/posts",
      headers: { cookie: author },
      payload: { body: " anonymous hello ", isAnonymous: true },
    });
    expect(created.statusCode).toBe(201);
    const post = created.json<PostResponse>().post;
    expect(post).toMatchObject({
      body: "anonymous hello",
      author: null,
      isMine: true,
      netScore: 1,
      viewerReaction: 1,
    });
    expect(post.anonymousIdentity).toBeTruthy();

    const viewed = await app.inject({
      method: "GET",
      url: `/v1/posts/${post.id}`,
      headers: { cookie: viewer },
    });
    expect(viewed.json<PostResponse>().post.anonymousIdentity).toEqual(
      post.anonymousIdentity,
    );
    const downvote = await app.inject({
      method: "PUT",
      url: `/v1/posts/${post.id}/reaction`,
      headers: { cookie: viewer },
      payload: { value: -1 },
    });
    expect(downvote.json()).toEqual({ viewerReaction: -1, netScore: 0 });
    const selfDownvote = await app.inject({
      method: "PUT",
      url: `/v1/posts/${post.id}/reaction`,
      headers: { cookie: author },
      payload: { value: -1 },
    });
    expect(selfDownvote.statusCode).toBe(409);

    let parentCommentId: string | undefined;
    let rootId = "";
    for (let depth = 0; depth < 6; depth += 1) {
      const response = await app.inject({
        method: "POST",
        url: `/v1/posts/${post.id}/comments`,
        headers: { cookie: viewer },
        payload: {
          body: `level ${depth}`,
          ...(parentCommentId ? { parentCommentId } : {}),
        },
      });
      expect(response.statusCode).toBe(201);
      const responseBody = response.json<CommentResponse>();
      expect(responseBody.comment.depth).toBe(depth);
      parentCommentId = responseBody.comment.id;
      if (depth === 0) rootId = responseBody.comment.id;
    }
    const deleted = await app.inject({
      method: "DELETE",
      url: `/v1/comments/${rootId}`,
      headers: { cookie: viewer },
    });
    expect(deleted.statusCode).toBe(204);
    const roots = await app.inject({
      method: "GET",
      url: `/v1/posts/${post.id}/comments`,
      headers: { cookie: viewer },
    });
    expect(roots.json<CommentsResponse>().comments[0]).toMatchObject({
      id: rootId,
      body: null,
      author: null,
      status: "DELETED",
      replyCount: 1,
    });
    const replies = await app.inject({
      method: "GET",
      url: `/v1/comments/${rootId}/replies`,
      headers: { cookie: viewer },
    });
    expect(replies.json<CommentsResponse>().comments).toHaveLength(1);
    const rejectedReply = await app.inject({
      method: "POST",
      url: `/v1/posts/${post.id}/comments`,
      headers: { cookie: author },
      payload: { body: "late reply", parentCommentId: rootId },
    });
    expect(rejectedReply.statusCode).toBe(409);

    const removed = await app.inject({
      method: "DELETE",
      url: `/v1/posts/${post.id}`,
      headers: { cookie: viewer },
    });
    expect(removed.statusCode).toBe(204);
    expect(
      (await prisma.post.findUniqueOrThrow({ where: { id: post.id } })).status,
    ).toBe("REMOVED");
  });
});
