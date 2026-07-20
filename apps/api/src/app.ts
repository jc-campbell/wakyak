import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import staticFiles from "@fastify/static";
import { prisma, type PrismaClient } from "@wakyak/database";
import Fastify, { type FastifyServerOptions } from "fastify";
import { fileURLToPath } from "node:url";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";

import { createAuth, type Auth } from "./auth/auth.js";
import { createEmailService, type EmailService } from "./auth/email.js";
import { cleanupAttachments } from "./attachments/cleanup.js";
import {
  createImageProcessor,
  type ImageProcessor,
} from "./attachments/images.js";
import {
  createObjectStorage,
  type ObjectStorage,
} from "./attachments/storage.js";
import { loadEnv, type Env } from "./config/env.js";
import { AppError } from "./errors.js";
import { registerBetterAuth } from "./plugins/better-auth.js";
import { registerProfileRoutes } from "./routes/profiles.js";
import { registerInvitationRoutes } from "./routes/invitations.js";
import { registerPostRoutes } from "./routes/posts.js";
import { registerCommentRoutes } from "./routes/comments.js";
import { registerReactionRoutes } from "./routes/reactions.js";
import { registerAttachmentRoutes } from "./routes/attachments.js";
import { registerSystemRoutes } from "./routes/system.js";
import { registerSocialRoutes } from "./routes/social.js";
import { registerFeedRoutes } from "./routes/feed.js";
import { registerSettingsRoutes } from "./routes/settings.js";
import { registerNotificationRoutes } from "./routes/notifications.js";
import {
  processOutboxEvents,
  runScheduledNotificationJobs,
} from "./notifications/worker.js";

export interface BuildAppOptions {
  env?: Env;
  database?: PrismaClient;
  auth?: Auth;
  emailService?: EmailService;
  logger?: FastifyServerOptions["logger"];
  serveWeb?: boolean;
  webRoot?: string;
  storage?: ObjectStorage;
  imageProcessor?: ImageProcessor;
  attachmentCleanup?: boolean;
  backgroundJobs?: boolean;
}

const defaultWebRoot = fileURLToPath(
  new URL("../../web/dist", import.meta.url),
);

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
];

export async function buildApp(options: BuildAppOptions = {}) {
  const env = options.env ?? loadEnv();
  const database = options.database ?? prisma;
  const emailService = options.emailService ?? createEmailService(env);
  const auth = options.auth ?? createAuth(env, emailService, database);
  const storage = options.storage ?? createObjectStorage(env);
  const imageProcessor = options.imageProcessor ?? createImageProcessor();
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
  app.decorateRequest("profile", null);
  app.decorate("database", database);
  app.decorate("env", env);

  await app.register(cors, {
    origin: env.trustedOrigins,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["content-type", "authorization", "x-request-id"],
    maxAge: 86_400,
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        imgSrc: ["'self'", "data:", new URL(env.S3_ENDPOINT).origin],
      },
    },
  });
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
  registerSocialRoutes(app, database, env);
  registerFeedRoutes(app, database, env);
  registerSettingsRoutes(app, database);
  registerNotificationRoutes(app, database);
  registerProfileRoutes(app, database);
  registerInvitationRoutes(app, database, env);
  registerPostRoutes(app, database, env);
  registerCommentRoutes(app, database, env);
  registerReactionRoutes(app, database);
  registerAttachmentRoutes(app, database, storage, imageProcessor);

  if (options.backgroundJobs ?? options.database === undefined) {
    const runJobs = () =>
      Promise.all([
        processOutboxEvents(database, env),
        runScheduledNotificationJobs(database),
      ]).catch((error) =>
        app.log.error({ err: error }, "Background API job failed"),
      );
    void runJobs();
    const jobTimer = setInterval(() => void runJobs(), 5_000);
    jobTimer.unref();
    app.addHook("onClose", () => clearInterval(jobTimer));
  }

  if (options.attachmentCleanup ?? options.database === undefined) {
    await cleanupAttachments(database, storage, app.log);
    const cleanupTimer = setInterval(() => {
      void cleanupAttachments(database, storage, app.log).catch((error) => {
        app.log.error({ err: error }, "Scheduled attachment cleanup failed");
      });
    }, 60 * 60_000);
    cleanupTimer.unref();
    app.addHook("onClose", () => {
      clearInterval(cleanupTimer);
    });
  }

  const serveWeb = options.serveWeb ?? env.NODE_ENV === "production";
  if (serveWeb) {
    await app.register(staticFiles, {
      root: options.webRoot ?? defaultWebRoot,
      wildcard: false,
      setHeaders(reply, filePath) {
        if (filePath.endsWith("index.html")) {
          reply.header("cache-control", "no-cache");
        } else if (filePath.includes("/assets/")) {
          reply.header("cache-control", "public, max-age=31536000, immutable");
        }
      },
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith("/api/auth/")) {
      return reply.code(404).send({ message: "Not Found" });
    }

    const pathname = request.url.split("?", 1)[0] ?? request.url;
    const isBackendPath =
      pathname === "/api" ||
      pathname.startsWith("/api/") ||
      pathname === "/v1" ||
      pathname.startsWith("/v1/") ||
      pathname === "/health" ||
      pathname === "/ready";
    const acceptsHtml = request.headers.accept
      ?.split(",")
      .some((value) => value.trim().startsWith("text/html"));

    if (
      serveWeb &&
      !isBackendPath &&
      (request.method === "GET" || request.method === "HEAD") &&
      acceptsHtml
    ) {
      return reply
        .code(200)
        .type("text/html")
        .sendFile("index.html", { maxAge: 0, immutable: false });
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
