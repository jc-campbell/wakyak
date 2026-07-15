import { prisma } from "@wakyak/database";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import type { Env } from "../config/env.js";
import type { EmailService } from "./email.js";

export function createAuth(env: Env, emailService: EmailService) {
  return betterAuth({
    appName: "WakYak",
    baseURL: env.BETTER_AUTH_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: env.trustedOrigins,
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
