import {
  createInvitationRequestSchema,
  invitationRedeemRequestSchema,
  invitationResponseSchema,
  invitationsQuerySchema,
  invitationsResponseSchema,
} from "@wakyak/contracts";
import type { PrismaClient } from "@wakyak/database";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import type { Env } from "../config/env.js";
import { AppError } from "../errors.js";
import {
  createInvitationCookie,
  formatInvitationCode,
  generateInvitationCode,
  normalizeInvitationCode,
} from "../invitations.js";
import { requireOwner } from "../plugins/authentication.js";
import { errorResponseSchema } from "../schemas.js";

function statusOf(invitation: {
  status: "ACTIVE" | "USED" | "REVOKED" | "EXPIRED";
  expiresAt: Date;
  consumedAt: Date | null;
  revokedAt: Date | null;
}): "ACTIVE" | "USED" | "REVOKED" | "EXPIRED" {
  if (invitation.status === "ACTIVE" && invitation.expiresAt <= new Date())
    return "EXPIRED";
  return invitation.status;
}

function invitationDto(invitation: {
  id: string;
  code: string;
  label: string | null;
  createdAt: Date;
  expiresAt: Date;
  status: "ACTIVE" | "USED" | "REVOKED" | "EXPIRED";
  consumedAt: Date | null;
  revokedAt: Date | null;
}) {
  return {
    ...invitation,
    code: formatInvitationCode(invitation.code),
    status: statusOf(invitation),
    createdAt: invitation.createdAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
    consumedAt: invitation.consumedAt?.toISOString() ?? null,
    revokedAt: invitation.revokedAt?.toISOString() ?? null,
  };
}

export function registerInvitationRoutes(
  app: FastifyInstance,
  database: PrismaClient,
  env: Env,
): void {
  const server = app.withTypeProvider<ZodTypeProvider>();

  server.post(
    "/v1/invitations/redeem",
    {
      schema: {
        body: invitationRedeemRequestSchema,
        response: {
          204: z.null(),
          400: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const code = normalizeInvitationCode(request.body.code);
      if (!code) {
        throw new AppError(
          400,
          "INVITATION_INVALID",
          "Invalid invitation code.",
        );
      }
      const invitation = await database.invitation.findUnique({
        where: { code },
      });
      if (
        !invitation ||
        invitation.status !== "ACTIVE" ||
        invitation.expiresAt <= new Date()
      ) {
        if (
          invitation?.status === "ACTIVE" &&
          invitation.expiresAt <= new Date()
        )
          await database.invitation.update({
            where: { id: invitation.id },
            data: { status: "EXPIRED" },
          });
        throw new AppError(
          409,
          "INVITATION_UNAVAILABLE",
          "That invitation is unavailable.",
        );
      }
      reply.header(
        "set-cookie",
        createInvitationCookie(
          invitation.id,
          env.INVITATION_COOKIE_SECRET,
          env.NODE_ENV === "production",
        ),
      );
      return reply.code(204).send(null);
    },
  );

  server.get(
    "/v1/admin/access",
    {
      preHandler: requireOwner,
      schema: {
        response: {
          204: z.null(),
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (_request, reply) => reply.code(204).send(null),
  );

  server.post(
    "/v1/admin/invitations",
    {
      preHandler: requireOwner,
      schema: {
        body: createInvitationRequestSchema,
        response: {
          201: invitationResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
          const invitation = await database.invitation.create({
            data: {
              code: generateInvitationCode(),
              expiresAt: new Date(Date.now() + 30 * 86_400_000),
              ...(request.body.label === undefined
                ? {}
                : { label: request.body.label }),
            },
          });
          return reply
            .code(201)
            .send({ invitation: invitationDto(invitation) });
        } catch (error) {
          if (attempt === 4) throw error;
        }
      }
      throw new AppError(500, "INTERNAL_ERROR", "Could not create invitation.");
    },
  );

  server.get(
    "/v1/admin/invitations",
    {
      preHandler: requireOwner,
      schema: {
        querystring: invitationsQuerySchema,
        response: {
          200: invitationsResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
        },
      },
    },
    async (request) => {
      let cursor: { createdAt: Date; id: string } | undefined;
      if (request.query.cursor) {
        try {
          const value = JSON.parse(
            Buffer.from(request.query.cursor, "base64url").toString(),
          ) as { v: number; createdAt: string; id: string };
          if (value.v !== 1 || !value.id) throw new Error();
          cursor = { createdAt: new Date(value.createdAt), id: value.id };
          if (Number.isNaN(cursor.createdAt.valueOf())) throw new Error();
        } catch {
          throw new AppError(400, "VALIDATION_ERROR", "Invalid cursor.");
        }
      }
      const rows = await database.invitation.findMany({
        ...(cursor
          ? {
              where: {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              },
            }
          : {}),
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: request.query.limit + 1,
      });
      const hasMore = rows.length > request.query.limit;
      const page = rows.slice(0, request.query.limit);
      const last = page.at(-1);
      return {
        invitations: page.map(invitationDto),
        nextCursor:
          hasMore && last
            ? Buffer.from(
                JSON.stringify({
                  v: 1,
                  createdAt: last.createdAt.toISOString(),
                  id: last.id,
                }),
              ).toString("base64url")
            : null,
      };
    },
  );

  server.delete(
    "/v1/admin/invitations/:id",
    {
      preHandler: requireOwner,
      schema: {
        params: z.object({ id: z.uuid() }),
        response: {
          204: z.null(),
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const updated = await database.invitation.updateMany({
        where: {
          id: request.params.id,
          status: "ACTIVE",
          expiresAt: { gt: new Date() },
        },
        data: { revokedAt: new Date(), status: "REVOKED" },
      });
      if (updated.count === 0) {
        const found = await database.invitation.findUnique({
          where: { id: request.params.id },
        });
        if (!found)
          throw new AppError(
            404,
            "INVITATION_INVALID",
            "Invitation not found.",
          );
        throw new AppError(
          409,
          "INVITATION_UNAVAILABLE",
          "That invitation cannot be revoked.",
        );
      }
      return reply.code(204).send(null);
    },
  );
}
