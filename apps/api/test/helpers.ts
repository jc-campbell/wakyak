import { prisma } from "@wakyak/database";
import type { FastifyInstance } from "fastify";
import type { OutgoingHttpHeaders } from "node:http";

import { buildApp } from "../src/app.js";
import { InMemoryEmailService } from "../src/auth/email.js";
import { loadEnv } from "../src/config/env.js";

export const testEnv = loadEnv({
  ...process.env,
  NODE_ENV: "test",
  GOOGLE_AUTH_ENABLED: "false",
  EMAIL_MODE: "console",
  SITE_OWNER_EMAIL: "owner@example.com",
  ANONYMITY_SECRET: "an-anonymity-secret-with-at-least-32-characters",
  INVITATION_COOKIE_SECRET: "an-invitation-secret-with-at-least-32-characters",
  S3_ENDPOINT: "http://localhost:9090",
  S3_REGION: "us-east-1",
  S3_BUCKET: "wakyak-attachments",
  S3_ACCESS_KEY_ID: "test",
  S3_SECRET_ACCESS_KEY: "test",
  S3_FORCE_PATH_STYLE: "true",
});

export async function cleanDatabase(): Promise<void> {
  await prisma.scheduledJobRun.deleteMany();
  await prisma.outboxEvent.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.postMilestone.deleteMany();
  await prisma.postTrendAward.deleteMany();
  await prisma.threadSubscription.deleteMany();
  await prisma.follow.deleteMany();
  await prisma.block.deleteMany();
  await prisma.feedSeen.deleteMany();
  await prisma.profileSettings.deleteMany();
  await prisma.reaction.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();
  await prisma.invitation.deleteMany();
  await prisma.verification.deleteMany();
}

export async function createTestApp(): Promise<{
  app: FastifyInstance;
  email: InMemoryEmailService;
}> {
  const email = new InMemoryEmailService();
  const app = await buildApp({
    env: testEnv,
    emailService: email,
    logger: false,
    backgroundJobs: false,
  });
  await app.ready();
  return { app, email };
}

export function cookiesFrom(headers: OutgoingHttpHeaders): string {
  const raw = headers["set-cookie"];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values.map((value) => value.split(";", 1)[0]).join("; ");
}

export async function registerAndVerify(
  app: FastifyInstance,
  emailService: InMemoryEmailService,
  email: string,
  password = "correct-horse-battery-staple",
): Promise<void> {
  let invitationCookie: string | undefined;
  if (email.trim().toLowerCase() !== testEnv.SITE_OWNER_EMAIL) {
    const code = crypto
      .randomUUID()
      .replaceAll("-", "")
      .slice(0, 16)
      .toUpperCase()
      .replace(/[ILOU]/g, "A");
    await prisma.invitation.create({
      data: { code, expiresAt: new Date(Date.now() + 30 * 86_400_000) },
    });
    const redemption = await app.inject({
      method: "POST",
      url: "/v1/invitations/redeem",
      payload: { code },
    });
    invitationCookie = cookiesFrom(redemption.headers);
  }
  const signup = await app.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    payload: { name: "Test Person", email, password },
    ...(invitationCookie ? { headers: { cookie: invitationCookie } } : {}),
  });
  if (signup.statusCode !== 200) {
    throw new Error(`Signup failed (${signup.statusCode}): ${signup.body}`);
  }

  const message = emailService.messages.findLast(
    (item) => item.to === email && item.type === "verification",
  );
  if (!message) throw new Error("Verification email was not captured.");
  const verificationUrl = new URL(message.url);
  const verification = await app.inject({
    method: "GET",
    url: `${verificationUrl.pathname}${verificationUrl.search}`,
  });
  if (verification.statusCode !== 200 && verification.statusCode !== 302) {
    throw new Error(
      `Verification failed (${verification.statusCode}): ${verification.body}`,
    );
  }
}

export async function login(
  app: FastifyInstance,
  email: string,
  password = "correct-horse-battery-staple",
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    payload: { email, password },
  });
  if (response.statusCode !== 200) {
    throw new Error(`Login failed (${response.statusCode}): ${response.body}`);
  }
  const cookie = cookiesFrom(response.headers);
  if (!cookie) throw new Error("Login did not establish a session cookie.");
  return cookie;
}
