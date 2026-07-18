import { fromNodeHeaders } from "better-auth/node";
import type { FastifyRequest } from "fastify";

import { AppError } from "../errors.js";

export async function requireAuthentication(
  request: FastifyRequest,
): Promise<void> {
  const session = await request.server.auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });

  if (!session) {
    throw new AppError(401, "UNAUTHENTICATED", "Authentication is required.");
  }

  request.authSession = {
    user: {
      id: session.user.id,
      email: session.user.email,
      emailVerified: session.user.emailVerified,
    },
    session: { id: session.session.id },
  };
}

export async function requireProfile(request: FastifyRequest): Promise<void> {
  if (!request.authSession) await requireAuthentication(request);
  const profile = await request.server.database.profile.findUnique({
    where: { authUserId: request.authSession!.user.id },
    select: {
      userId: true,
      authUserId: true,
      handle: true,
      displayName: true,
    },
  });
  if (!profile) {
    throw new AppError(
      403,
      "PROFILE_NOT_FOUND",
      "Complete your profile first.",
    );
  }
  request.profile = profile;
}

export async function requireOwner(request: FastifyRequest): Promise<void> {
  await requireProfile(request);
  if (
    request.authSession!.user.email.trim().toLowerCase() !==
    request.server.env.SITE_OWNER_EMAIL
  ) {
    throw new AppError(403, "FORBIDDEN", "Owner access is required.");
  }
}
