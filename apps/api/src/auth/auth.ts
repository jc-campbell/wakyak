import { prisma } from "@wakyak/database";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { importPKCS8, SignJWT } from "jose";

import type { Env } from "../config/env.js";
import type { EmailService } from "./email.js";

async function generateAppleClientSecret(env: Env): Promise<string> {
  const key = await importPKCS8(env.applePrivateKey!, "ES256");
  const now = Math.floor(Date.now() / 1_000);

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env.APPLE_KEY_ID! })
    .setIssuer(env.APPLE_TEAM_ID!)
    .setSubject(env.APPLE_CLIENT_ID!)
    .setAudience("https://appleid.apple.com")
    .setIssuedAt(now)
    .setExpirationTime(now + 180 * 24 * 60 * 60)
    .sign(key);
}

export function createAuth(env: Env, emailService: EmailService) {
  const trustedOrigins = env.APPLE_AUTH_ENABLED
    ? [...env.trustedOrigins, "https://appleid.apple.com"]
    : env.trustedOrigins;

  return betterAuth({
    appName: "WakYak",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins,
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      async sendResetPassword({ user, url }) {
        await emailService.send({
          to: user.email,
          type: "password-reset",
          url,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      expiresIn: 3_600,
      async sendVerificationEmail({ user, url }) {
        await emailService.send({ to: user.email, type: "verification", url });
      },
    },
    session: {
      expiresIn: env.SESSION_EXPIRES_IN_SECONDS,
      updateAge: env.SESSION_UPDATE_AGE_SECONDS,
      freshAge: 86_400,
    },
    account: {
      accountLinking: {
        enabled: true,
        disableImplicitLinking: false,
        requireLocalEmailVerified: true,
        trustedProviders: [
          "email-password",
          ...(env.GOOGLE_AUTH_ENABLED ? ["google"] : []),
          ...(env.APPLE_AUTH_ENABLED ? ["apple"] : []),
        ],
      },
    },
    socialProviders: {
      ...(env.GOOGLE_AUTH_ENABLED
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID!,
              clientSecret: env.GOOGLE_CLIENT_SECRET!,
            },
          }
        : {}),
      ...(env.APPLE_AUTH_ENABLED
        ? {
            apple: async () => ({
              clientId: env.APPLE_CLIENT_ID!,
              clientSecret: await generateAppleClientSecret(env),
              ...(env.APPLE_APP_BUNDLE_IDENTIFIER
                ? { appBundleIdentifier: env.APPLE_APP_BUNDLE_IDENTIFIER }
                : {}),
            }),
          }
        : {}),
    },
    advanced: {
      useSecureCookies: env.NODE_ENV === "production",
      cookiePrefix: "wakyak",
      defaultCookieAttributes: {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
