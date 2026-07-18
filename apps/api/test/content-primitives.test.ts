import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { anonymousIdentity } from "../src/content/anonymity.js";
import { decodeCursor, encodeCursor } from "../src/content/cursor.js";
import { hotRank } from "../src/content/ranking.js";
import { graphemeCount } from "../src/content/validation.js";
import { createImageProcessor } from "../src/attachments/images.js";
import {
  invitationIdFromCookie,
  createInvitationCookie,
  normalizeInvitationCode,
} from "../src/invitations.js";

describe("content primitives", () => {
  it("counts Unicode grapheme clusters rather than code points", () => {
    expect(graphemeCount("👨‍👩‍👧‍👦👍🏽é")).toBe(3);
  });

  it("binds versioned cursors to their query", () => {
    const cursor = encodeCursor({
      scope: "posts",
      sort: "hot",
      window: "week",
      id: "one",
    });
    expect(
      decodeCursor(cursor, { scope: "posts", sort: "hot", window: "week" }),
    ).toMatchObject({ id: "one" });
    expect(() =>
      decodeCursor(cursor, { scope: "posts", sort: "top", window: "week" }),
    ).toThrow(/cursor/i);
  });

  it("calculates stored Hot rank only from score and creation time", () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    expect(hotRank(0, createdAt)).toBe(createdAt.getTime() / 1000 / 129_600);
    expect(hotRank(3, createdAt) - hotRank(0, createdAt)).toBeCloseTo(2);
    expect(hotRank(-3, createdAt) - hotRank(0, createdAt)).toBeCloseTo(-2);
  });

  it("keeps anonymous identities stable within a post and isolated across posts", () => {
    const secret = "a-secret-that-is-at-least-thirty-two-characters";
    expect(anonymousIdentity("post-a", "profile-a", secret)).toEqual(
      anonymousIdentity("post-a", "profile-a", secret),
    );
    expect(anonymousIdentity("post-a", "profile-a", secret)).not.toEqual(
      anonymousIdentity("post-b", "profile-a", secret),
    );
  });

  it("normalizes invitation separators and verifies signed cookies", () => {
    expect(normalizeInvitationCode("0123-4567 89ab_cdef")).toBe(
      "0123456789ABCDEF",
    );
    const secret = "an-invitation-cookie-secret-over-thirty-two-characters";
    const cookie = createInvitationCookie("invitation-id", secret, false);
    expect(invitationIdFromCookie(cookie, secret)).toBe("invitation-id");
    expect(invitationIdFromCookie(cookie, `${secret}!`)).toBeNull();
  });

  it("normalizes a static image to stripped WebP and rejects format mismatch", async () => {
    const input = await sharp({
      create: { width: 20, height: 10, channels: 3, background: "red" },
    })
      .png()
      .withMetadata({ exif: { IFD0: { Copyright: "private" } } })
      .toBuffer();
    const processor = createImageProcessor();
    const output = await processor.normalize(input, "image/png");
    const metadata = await sharp(output.body).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 20, height: 10 });
    expect(metadata.exif).toBeUndefined();
    await expect(processor.normalize(input, "image/jpeg")).rejects.toThrow(
      /match/i,
    );
  });
});
