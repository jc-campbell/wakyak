import type { Auth } from "../auth/auth.js";
import type { Env } from "../config/env.js";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { fromNodeHeaders } from "better-auth/node";

const sensitivePaths = new Set([
  "/api/auth/sign-up/email",
  "/api/auth/sign-in/email",
  "/api/auth/request-password-reset",
  "/api/auth/send-verification-email",
]);

function requestBody(request: FastifyRequest): string | undefined {
  if (request.body === undefined || request.body === null) return undefined;
  const contentType = request.headers["content-type"] ?? "";
  if (contentType.includes("application/x-www-form-urlencoded")) {
    const values = request.body as Record<string, string>;
    return new URLSearchParams(values).toString();
  }
  if (typeof request.body === "string") return request.body;
  return JSON.stringify(request.body);
}

export function registerBetterAuth(
  app: FastifyInstance,
  auth: Auth,
  env: Env,
): void {
  app.decorate("auth", auth);

  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    config: {
      rateLimit: {
        max: 8,
        timeWindow: "1 minute",
        allowList: (request) => {
          const path = request.url.split("?", 1)[0] ?? request.url;
          return !sensitivePaths.has(path);
        },
      },
    },
    async handler(request, reply) {
      const url = new URL(request.url, env.API_ORIGIN);
      const body = requestBody(request);
      const response = await auth.handler(
        new Request(url, {
          method: request.method,
          headers: fromNodeHeaders(request.headers),
          ...(body === undefined ? {} : { body }),
        }),
      );

      reply.hijack();
      reply.raw.statusCode = response.status;
      response.headers.forEach((value, key) => {
        if (key !== "set-cookie") reply.raw.setHeader(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.raw.setHeader("set-cookie", cookies);
      const responseBody = response.body
        ? Buffer.from(await response.arrayBuffer())
        : undefined;
      reply.raw.end(responseBody);
    },
  });
}
