import { describe, expect, it } from "vitest";

import {
  blockSchema,
  commentSchema,
  feedResponseSchema,
  invitationResponseSchema,
  meResponseSchema,
  notificationSchema,
  postSchema,
  profileDetailsSchema,
} from "./index.js";

describe("API contracts", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  it("accepts an anonymous post without an identifiable author", () => {
    const value = postSchema.parse({
      id,
      body: "hello",
      author: null,
      anonymousIdentity: { emoji: "🦊", color: "orange", paletteVersion: "v1" },
      isMine: false,
      isPostAuthor: false,
      viewerReaction: null,
      isAnonymous: true,
      netScore: 3,
      commentCount: 0,
      attachments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(value.author).toBeNull();
    expect(JSON.stringify(value)).not.toMatch(/userId|handle/);
  });

  it("rejects incomplete comment DTOs", () => {
    expect(() => commentSchema.parse({ id })).toThrow();
  });

  it("keeps blocks opaque", () => {
    const value = blockSchema.parse({
      blockId: id,
      createdAt: new Date().toISOString(),
      displaySnapshot: {
        label: "Anonymous",
        emoji: "🦊",
        color: "orange",
        paletteVersion: "v1",
      },
    });
    expect(value).not.toHaveProperty("blockedProfileId");
    expect(value).not.toHaveProperty("handle");
  });

  it("uses exact seen state instead of exposing checkpoint fields", () => {
    const value = feedResponseSchema.parse({ posts: [], nextCursor: null });
    expect(value).not.toHaveProperty("checkpoint");
    expect(value).not.toHaveProperty("checkpointCandidate");
  });

  it("keeps anonymous notification actors free of stable identity", () => {
    const value = notificationSchema.parse({
      id,
      type: "DIRECT_REPLY",
      postId: id,
      commentId: id,
      payload: {
        actor: {
          kind: "anonymous",
          identity: { emoji: "🦊", color: "orange", paletteVersion: "v1" },
        },
        excerpt: "hello",
      },
      readAt: null,
      createdAt: new Date().toISOString(),
    });
    if (value.type !== "DIRECT_REPLY") throw new Error("Unexpected type.");
    expect(JSON.stringify(value.payload.actor)).not.toMatch(/userId|handle/);
  });

  it("requires complete profile details", () => {
    expect(() =>
      profileDetailsSchema.parse({
        userId: "member",
        handle: "member",
        displayName: "Member",
      }),
    ).toThrow();
  });

  it("keeps owner authorization out of the session payload", () => {
    const value = meResponseSchema.parse({
      user: {
        id: "auth-user",
        email: "owner@example.com",
        emailVerified: true,
      },
      profile: null,
      isOwner: true,
    });
    expect(value).not.toHaveProperty("isOwner");
  });

  it("validates complete invitation administration responses", () => {
    expect(
      invitationResponseSchema.parse({
        invitation: {
          id,
          code: "ABCD-EFGH-JKMP-QRST",
          label: null,
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
          consumedAt: null,
          revokedAt: null,
        },
      }).invitation.status,
    ).toBe("ACTIVE");
  });
});
