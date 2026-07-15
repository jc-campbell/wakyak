import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { prisma, type PrismaClient } from "@wakyak/database";
import Fastify, { type FastifyServerOptions } from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";

import { createAuth, type Auth } from "./auth/auth.js";
import { createEmailService, type EmailService } from "./auth/email.js";
import { loadEnv, type Env } from "./config/env.js";
import { AppError } from "./errors.js";
import { registerBetterAuth } from "./plugins/better-auth.js";
import { registerProfileRoutes } from "./routes/profiles.js";
import { registerSystemRoutes } from "./routes/system.js";

export interface BuildAppOptions {
  env?: Env;
  database?: PrismaClient;
  auth?: Auth;
  emailService?: EmailService;
  logger?: FastifyServerOptions["logger"];
}

const redactionPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "res.headers.set-cookie",
  "password",
  "*.password",
  "**.password",
  "clientSecret",
  "*.clientSecret",
  "**.clientSecret",
  "apiKey",
  "*.apiKey",
  "**.apiKey",
  "code",
  "*.code",
  "**.code",
  "token",
  "*.token",
  "**.token",
  "resetToken",
  "verificationToken",
  "privateKey",
  "*.privateKey",
  "**.privateKey",
];

export async function buildApp(options: BuildAppOptions = {}) {
  const env = options.env ?? loadEnv();
  const database = options.database ?? prisma;
  const emailService = options.emailService ?? createEmailService(env);
  const auth = options.auth ?? createAuth(env, emailService);
  const logger = options.logger ?? {
    level: env.NODE_ENV === "production" ? "info" : "debug",
    redact: { paths: redactionPaths, censor: "[REDACTED]" },
    ...(env.NODE_ENV === "development"
      ? { transport: { target: "pino-pretty", options: { colorize: true } } }
      : {}),
  };

  const app = Fastify({
    logger,
    trustProxy: env.TRUST_PROXY,
    bodyLimit: env.BODY_LIMIT_BYTES,
    requestIdHeader: "x-request-id",
    genReqId: (request) =>
      request.headers["x-request-id"]?.toString() ?? crypto.randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorateRequest("authSession", null);

  await app.register(cors, {
    origin: env.trustedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["content-type", "authorization", "x-request-id"],
    maxAge: 86_400,
  });
  await app.register(helmet);
  await app.register(formbody);
  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: "1 minute",
    errorResponseBuilder: (request) => ({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests.",
        requestId: request.id,
      },
    }),
  });

  registerBetterAuth(app, auth, env);
  registerSystemRoutes(app, database);
  registerProfileRoutes(app, database);

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/auth/")) {
      return reply.code(404).send({ message: "Not Found" });
    }
    return reply.code(404).send({
      error: {
        code: "NOT_FOUND",
        message: "Route not found.",
        requestId: request.id,
      },
    });
  });

  app.setErrorHandler(async (error, request, reply) => {
    if (request.url.startsWith("/api/auth/")) {
      request.log.error({ err: error }, "Better Auth request failed");
      const statusCode =
        typeof error === "object" && error !== null && "statusCode" in error
          ? Number(error.statusCode)
          : 500;
      return reply
        .code(statusCode)
        .send({ message: "Authentication request failed." });
    }

    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id,
        },
      });
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "validation" in error &&
      error.validation
    ) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "The request is invalid.",
          requestId: request.id,
        },
      });
    }

    request.log.error({ err: error }, "Unhandled application error");
    return reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal error occurred.",
        requestId: request.id,
      },
    });
  });

  return app;
}
