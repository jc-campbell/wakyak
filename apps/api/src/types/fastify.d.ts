import type { Auth } from "../auth/auth.js";
import type { PrismaClient } from "@wakyak/database";
import type { Env } from "../config/env.js";

declare module "fastify" {
  interface FastifyInstance {
    auth: Auth;
    database: PrismaClient;
    env: Env;
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
    profile: {
      userId: string;
      authUserId: string;
      handle: string;
      displayName: string;
    } | null;
  }
}
