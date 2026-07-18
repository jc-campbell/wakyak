import { prisma } from "@wakyak/database";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cleanDatabase,
  createTestApp,
  login,
  registerAndVerify,
} from "./helpers.js";

let app: FastifyInstance;
let emailService: Awaited<ReturnType<typeof createTestApp>>["email"];

beforeEach(async () => {
  await cleanDatabase();
  ({ app, email: emailService } = await createTestApp());
});
afterEach(async () => app.close());

async function user(email: string, userId: string) {
  await registerAndVerify(app, emailService, email);
  const cookie = await login(app, email);
  await app.inject({
    method: "POST",
    url: "/v1/profile",
    headers: { cookie },
    payload: {
      userId,
      handle: userId.replaceAll("-", "_"),
      displayName: userId,
    },
  });
  return cookie;
}

describe("account deletion", () => {
  it("erases authored content, reconciles votes, and preserves invitation consumption", async () => {
    const deletingCookie = await user("deleting@example.com", "deleting-user");
    const otherCookie = await user("other@example.com", "other-user");
    const deletingUser = await prisma.user.findUniqueOrThrow({
      where: { email: "deleting@example.com" },
    });
    const invitationId = deletingUser.invitationId!;

    const ownPost = (
      await app.inject({
        method: "POST",
        url: "/v1/posts",
        headers: { cookie: deletingCookie },
        payload: { body: "erase me" },
      })
    ).json<{ post: { id: string } }>().post;
    const otherPost = (
      await app.inject({
        method: "POST",
        url: "/v1/posts",
        headers: { cookie: otherCookie },
        payload: { body: "keep me" },
      })
    ).json<{ post: { id: string } }>().post;
    await app.inject({
      method: "PUT",
      url: `/v1/posts/${otherPost.id}/reaction`,
      headers: { cookie: deletingCookie },
      payload: { value: -1 },
    });
    const comment = (
      await app.inject({
        method: "POST",
        url: `/v1/posts/${otherPost.id}/comments`,
        headers: { cookie: deletingCookie },
        payload: { body: "erase this too" },
      })
    ).json<{ comment: { id: string } }>().comment;

    const requested = await app.inject({
      method: "POST",
      url: "/api/auth/delete-user",
      headers: { cookie: deletingCookie },
      payload: {},
    });
    expect(requested.statusCode).toBe(200);
    const message = emailService.messages.findLast(
      (item) => item.type === "account-deletion",
    );
    expect(message).toBeDefined();
    const callback = new URL(message!.url);
    const completed = await app.inject({
      method: "GET",
      url: `${callback.pathname}${callback.search}`,
      headers: { cookie: deletingCookie },
    });
    expect([200, 302], completed.body).toContain(completed.statusCode);

    expect(
      await prisma.user.findUnique({ where: { id: deletingUser.id } }),
    ).toBeNull();
    const retainedInvitation = await prisma.invitation.findUniqueOrThrow({
      where: { id: invitationId },
    });
    expect(retainedInvitation.consumedAt).toBeInstanceOf(Date);
    expect(
      await prisma.post.findUniqueOrThrow({ where: { id: ownPost.id } }),
    ).toMatchObject({ status: "DELETED", body: null, authorProfileId: null });
    expect(
      await prisma.comment.findUniqueOrThrow({ where: { id: comment.id } }),
    ).toMatchObject({ status: "DELETED", body: null, authorProfileId: null });
    expect(
      await prisma.post.findUniqueOrThrow({ where: { id: otherPost.id } }),
    ).toMatchObject({
      upvoteCount: 1,
      downvoteCount: 0,
      netScore: 1,
      commentCount: 0,
    });
  });
});
