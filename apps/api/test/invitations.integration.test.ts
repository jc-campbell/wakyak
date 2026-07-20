import { prisma } from "@wakyak/database";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cleanDatabase,
  cookiesFrom,
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

describe("invitations", () => {
  it("allows the owner bypass and consumes a displayed code exactly once", async () => {
    await registerAndVerify(app, emailService, testEnv.SITE_OWNER_EMAIL);
    const ownerCookie = await login(app, testEnv.SITE_OWNER_EMAIL);
    await app.inject({
      method: "POST",
      url: "/v1/profile",
      headers: { cookie: ownerCookie },
      payload: {
        userId: "owner-user",
        handle: "owner_user",
        displayName: "Owner",
      },
    });

    const ownerAccess = await app.inject({
      method: "GET",
      url: "/v1/admin/access",
      headers: { cookie: ownerCookie },
    });
    expect(ownerAccess.statusCode).toBe(204);
    const me = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie: ownerCookie },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).not.toHaveProperty("isOwner");

    const created = await app.inject({
      method: "POST",
      url: "/v1/admin/invitations",
      headers: { cookie: ownerCookie },
      payload: { label: "Friend" },
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json<{
      invitation: { code: string; label: string | null; status: string };
    }>();
    expect(createdBody.invitation).toMatchObject({
      label: "Friend",
      status: "ACTIVE",
    });
    const code = createdBody.invitation.code;

    const denied = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      payload: {
        name: "No Invite",
        email: "no-invite@example.com",
        password: "correct-horse-battery-staple",
      },
    });
    expect(denied.statusCode).toBe(403);

    const redeemed = await app.inject({
      method: "POST",
      url: "/v1/invitations/redeem",
      payload: { code: code.toLowerCase() },
    });
    expect(redeemed.statusCode).toBe(204);
    const signup = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { cookie: cookiesFrom(redeemed.headers) },
      payload: {
        name: "Invited",
        email: "invited@example.com",
        password: "correct-horse-battery-staple",
      },
    });
    expect(signup.statusCode).toBe(200);
    const invited = await prisma.user.findUniqueOrThrow({
      where: { email: "invited@example.com" },
      include: { invitation: true },
    });
    expect(invited.invitation?.consumedAt).toBeInstanceOf(Date);

    const reused = await app.inject({
      method: "POST",
      url: "/v1/invitations/redeem",
      payload: { code },
    });
    expect(reused.statusCode).toBe(409);
    const listed = await app.inject({
      method: "GET",
      url: "/v1/admin/invitations",
      headers: { cookie: ownerCookie },
    });
    expect(
      listed.json<{ invitations: { code: string; status: string }[] }>()
        .invitations[0],
    ).toMatchObject({
      code,
      status: "USED",
    });
  });

  it("keeps owner authorization server-side and revokes active codes", async () => {
    expect(
      (await app.inject({ method: "GET", url: "/v1/admin/access" })).statusCode,
    ).toBe(401);

    await registerAndVerify(app, emailService, "member@example.com");
    const memberCookie = await login(app, "member@example.com");
    await app.inject({
      method: "POST",
      url: "/v1/profile",
      headers: { cookie: memberCookie },
      payload: {
        userId: "member-user",
        handle: "member_user",
        displayName: "Member",
      },
    });
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/admin/access",
          headers: { cookie: memberCookie },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/admin/invitations",
          headers: { cookie: memberCookie },
        })
      ).statusCode,
    ).toBe(403);

    await registerAndVerify(app, emailService, testEnv.SITE_OWNER_EMAIL);
    const ownerCookie = await login(app, testEnv.SITE_OWNER_EMAIL);
    await app.inject({
      method: "POST",
      url: "/v1/profile",
      headers: { cookie: ownerCookie },
      payload: {
        userId: "owner-user",
        handle: "owner_user",
        displayName: "Owner",
      },
    });
    const created = await app.inject({
      method: "POST",
      url: "/v1/admin/invitations",
      headers: { cookie: ownerCookie },
      payload: {},
    });
    const invitation = created.json<{ invitation: { id: string } }>()
      .invitation;
    const revoked = await app.inject({
      method: "DELETE",
      url: `/v1/admin/invitations/${invitation.id}`,
      headers: { cookie: ownerCookie },
    });
    expect(revoked.statusCode).toBe(204);
    const stored = await prisma.invitation.findUniqueOrThrow({
      where: { id: invitation.id },
    });
    expect(stored.status).toBe("REVOKED");
    expect(stored.revokedAt).toBeInstanceOf(Date);
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/v1/admin/invitations/${invitation.id}`,
          headers: { cookie: ownerCookie },
        })
      ).statusCode,
    ).toBe(409);
  });

  it("expires old codes and permits only one concurrent signup", async () => {
    const expired = await prisma.invitation.create({
      data: {
        code: "FEDCBA9876543210",
        expiresAt: new Date(Date.now() - 1_000),
      },
    });
    const expiredResult = await app.inject({
      method: "POST",
      url: "/v1/invitations/redeem",
      payload: { code: expired.code },
    });
    expect(expiredResult.statusCode).toBe(409);
    expect(
      (await prisma.invitation.findUniqueOrThrow({ where: { id: expired.id } }))
        .status,
    ).toBe("EXPIRED");

    const invitation = await prisma.invitation.create({
      data: {
        code: "0123456789ABCDEF",
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const redemption = await app.inject({
      method: "POST",
      url: "/v1/invitations/redeem",
      payload: { code: invitation.code },
    });
    const cookie = cookiesFrom(redemption.headers);
    const results = await Promise.all(
      ["race-one@example.com", "race-two@example.com"].map((email) =>
        app.inject({
          method: "POST",
          url: "/api/auth/sign-up/email",
          headers: { cookie },
          payload: {
            name: "Invitation Race",
            email,
            password: "correct-horse-battery-staple",
          },
        }),
      ),
    );
    expect(results.filter((result) => result.statusCode === 200)).toHaveLength(
      1,
    );
    expect(
      await prisma.user.count({ where: { invitationId: invitation.id } }),
    ).toBe(1);
    expect(
      (
        await prisma.invitation.findUniqueOrThrow({
          where: { id: invitation.id },
        })
      ).status,
    ).toBe("USED");
  });
});
