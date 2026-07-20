import { prisma, type PrismaClient } from "@wakyak/database";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError } from "better-auth/api";

import type { Env } from "../config/env.js";
import type { EmailService } from "./email.js";
import { deleteAccountContent } from "./account-deletion.js";
import { invitationIdFromCookie } from "../invitations.js";

export function createAuth(
  env: Env,
  emailService: EmailService,
  database: PrismaClient = prisma,
) {
  const baseURL =
    env.NODE_ENV === "development"
      ? {
          allowedHosts: [
            ...new Set([
              new URL(env.BETTER_AUTH_URL).host,
              new URL(env.API_ORIGIN).host,
              ...env.trustedOrigins.map((origin) => new URL(origin).host),
            ]),
          ],
          protocol: "auto" as const,
        }
      : env.BETTER_AUTH_URL;

  return betterAuth({
    appName: "WakYak",
    baseURL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: env.trustedOrigins,
    database: prismaAdapter(database, { provider: "postgresql" }),
    user: {
      additionalFields: {
        invitationId: {
          type: "string",
          required: false,
          input: false,
          returned: false,
        },
      },
      deleteUser: {
        enabled: true,
        async sendDeleteAccountVerification({ user, url }) {
          await emailService.send({
            to: user.email,
            type: "account-deletion",
            url,
          });
        },
        async beforeDelete(user) {
          await deleteAccountContent(database, user.id);
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          async before(user, context) {
            if (user.email.trim().toLowerCase() === env.SITE_OWNER_EMAIL) {
              return { data: user };
            }
            const invitationId = invitationIdFromCookie(
              context?.getHeader("cookie"),
              env.INVITATION_COOKIE_SECRET,
            );
            if (!invitationId) {
              throw new APIError("FORBIDDEN", {
                message: "A valid invitation is required.",
              });
            }
            const invitation = await database.invitation.findFirst({
              where: {
                id: invitationId,
                consumedAt: null,
                revokedAt: null,
                status: "ACTIVE",
                expiresAt: { gt: new Date() },
                user: null,
              },
              select: { id: true },
            });
            if (!invitation) {
              throw new APIError("FORBIDDEN", {
                message: "That invitation is unavailable.",
              });
            }
            return { data: { ...user, invitationId: invitation.id } };
          },
          async after(user) {
            const invitationId =
              typeof user.invitationId === "string" ? user.invitationId : null;
            if (!invitationId) return;
            const result = await database.invitation.updateMany({
              where: {
                id: invitationId,
                consumedAt: null,
                revokedAt: null,
                status: "ACTIVE",
                expiresAt: { gt: new Date() },
              },
              data: { consumedAt: new Date(), status: "USED" },
            });
            if (result.count !== 1) {
              throw new APIError("CONFLICT", {
                message: "That invitation was already used.",
              });
            }
          },
        },
      },
    },
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
