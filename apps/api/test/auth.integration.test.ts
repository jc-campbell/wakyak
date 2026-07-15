import { prisma } from "@wakyak/database";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  cleanDatabase,
  cookiesFrom,
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

afterEach(async () => {
  await app.close();
});

describe("email/password authentication", () => {
  it("signs up, captures and resends verification, verifies, logs in, and logs out", async () => {
    const email = "auth-flow@example.com";
    const password = "correct-horse-battery-staple";
    const signup = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      payload: { name: "Auth Flow", email, password },
    });
    expect(signup.statusCode).toBe(200);
    expect(emailService.messages).toHaveLength(1);
    expect(emailService.messages[0]).toMatchObject({
      to: email,
      type: "verification",
    });

    const unverifiedLogin = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email, password },
    });
    expect(unverifiedLogin.statusCode).toBe(403);
    expect(cookiesFrom(unverifiedLogin.headers)).toBe("");

    const resend = await app.inject({
      method: "POST",
      url: "/api/auth/send-verification-email",
      payload: { email },
    });
    expect(resend.statusCode).toBe(200);
    expect(emailService.messages).toHaveLength(3);

    const verifyUrl = new URL(emailService.messages.at(-1)!.url);
    const verification = await app.inject({
      method: "GET",
      url: `${verifyUrl.pathname}${verifyUrl.search}`,
    });
    expect([200, 302]).toContain(verification.statusCode);
    expect(await prisma.user.findUnique({ where: { email } })).toMatchObject({
      emailVerified: true,
    });

    const invalid = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      payload: { email, password: "not-the-password" },
    });
    expect(invalid.statusCode).toBe(401);
    expect(cookiesFrom(invalid.headers)).toBe("");

    const cookie = await login(app, email, password);
    const me = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie },
    });
    expect(me.statusCode).toBe(200);
    const meBody = me.json<{
      user: { id: string; email: string; emailVerified: boolean };
      profile: null;
    }>();
    expect(meBody.user).toMatchObject({ email, emailVerified: true });
    expect(meBody.profile).toBeNull();
    expect(me.body).not.toMatch(/password|token|cookie|provider/i);

    const logout = await app.inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(200);
    expect(cookiesFrom(logout.headers)).toContain("wakyak.session_token=");
    const afterLogout = await app.inject({
      method: "GET",
      url: "/v1/me",
      headers: { cookie },
    });
    expect(afterLogout.statusCode).toBe(401);
  });

  it("does not enumerate accounts and resets a password in test mode", async () => {
    const email = "reset@example.com";
    await registerAndVerify(app, emailService, email);
    const known = await app.inject({
      method: "POST",
      url: "/api/auth/request-password-reset",
      payload: { email, redirectTo: "http://localhost:5173/reset-password" },
    });
    const unknown = await app.inject({
      method: "POST",
      url: "/api/auth/request-password-reset",
      payload: {
        email: "absent@example.com",
        redirectTo: "http://localhost:5173/reset-password",
      },
    });
    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(200);
    expect(known.json()).toEqual(unknown.json());

    const resetMessage = emailService.messages.findLast(
      (item) => item.type === "password-reset",
    );
    expect(resetMessage).toBeDefined();
    const resetUrl = new URL(resetMessage!.url);
    const token = resetUrl.pathname.split("/").at(-1);
    expect(token).toBeTruthy();
    const reset = await app.inject({
      method: "POST",
      url: "/api/auth/reset-password",
      payload: { token, newPassword: "new-correct-horse-battery-staple" },
    });
    expect(reset.statusCode).toBe(200);
    await expect(login(app, email)).rejects.toThrow(/Login failed/);
    await expect(
      login(app, email, "new-correct-horse-battery-staple"),
    ).resolves.toContain("wakyak.session_token");
  });

  it("revokes all tested sessions and clears the current cookie", async () => {
    const email = "sessions@example.com";
    await registerAndVerify(app, emailService, email);
    const first = await login(app, email);
    const second = await login(app, email);
    expect(await prisma.session.count()).toBe(2);

    const response = await app.inject({
      method: "POST",
      url: "/v1/logout-all",
      headers: { cookie: first },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
    expect(cookiesFrom(response.headers)).toContain("wakyak.session_token=");
    expect(await prisma.session.count()).toBe(0);

    for (const cookie of [first, second]) {
      const me = await app.inject({
        method: "GET",
        url: "/v1/me",
        headers: { cookie },
      });
      expect(me.statusCode).toBe(401);
    }
  });
});
