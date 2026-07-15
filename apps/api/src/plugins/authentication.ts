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
