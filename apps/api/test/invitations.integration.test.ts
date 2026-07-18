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
      status: "AVAILABLE",
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
      status: "CONSUMED",
    });
  });
});
