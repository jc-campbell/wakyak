import type { Auth } from "../auth/auth.js";

declare module "fastify" {
  interface FastifyInstance {
    auth: Auth;
  }

  interface FastifyRequest {
    authSession: {
      user: {
        id: string;
        email: string;
        emailVerified: boolean;
      };
      session: {
        id: string;
      };
    } | null;
  }
}
