import {
  attachmentCompleteResponseSchema,
  attachmentUploadRequestSchema,
  attachmentUploadsResponseSchema,
} from "@wakyak/contracts";
import type { PrismaClient } from "@wakyak/database";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";

import type { ImageProcessor } from "../attachments/images.js";
import type { ObjectStorage } from "../attachments/storage.js";
import { AppError } from "../errors.js";
import { requireProfile } from "../plugins/authentication.js";
import { errorResponseSchema } from "../schemas.js";

const params = z.object({ id: z.uuid() });
export function registerAttachmentRoutes(
  app: FastifyInstance,
  database: PrismaClient,
  storage: ObjectStorage,
  images: ImageProcessor,
): void {
  const server = app.withTypeProvider<ZodTypeProvider>();

  const browserUploadUrl = (value: string) => {
    if (app.env.NODE_ENV !== "development") return value;
    try {
      const upload = new URL(value);
      const storage = new URL(app.env.S3_ENDPOINT);
      return upload.origin === storage.origin
        ? `/__storage${upload.pathname}${upload.search}`
        : value;
    } catch {
      return value;
    }
  };

  const browserDownloadUrl = (value: string) =>
    app.env.NODE_ENV === "development" && app.env.VITE_TAILSCALE_HOST
      ? browserUploadUrl(value)
      : value;

  server.post(
    "/v1/attachments/uploads",
    {
      preHandler: requireProfile,
      schema: {
        body: attachmentUploadRequestSchema,
        response: {
          201: attachmentUploadsResponseSchema,
          400: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const expiresAt = new Date(Date.now() + 60 * 60_000);
      const uploads = [];
      for (const file of request.body.files) {
        const id = crypto.randomUUID();
        const inputStorageKey = `incoming/${request.profile!.userId}/${id}`;
        const attachment = await database.attachment.create({
          data: {
            id,
            ownerProfileId: request.profile!.userId,
            inputStorageKey,
            declaredContentType: file.contentType,
            declaredByteSize: file.byteSize,
            expiresAt,
          },
        });
        try {
          const uploadUrl = await storage.presignUpload(
            inputStorageKey,
            file.contentType,
            file.byteSize,
          );
          uploads.push({
            id: attachment.id,
            uploadUrl: browserUploadUrl(uploadUrl),
            expiresAt: expiresAt.toISOString(),
            headers: { "content-type": file.contentType },
          });
        } catch (error) {
          await database.attachment.delete({ where: { id } });
          throw error;
        }
      }
      return reply.code(201).send({ uploads });
    },
  );

  server.post(
    "/v1/attachments/:id/complete",
    {
      preHandler: requireProfile,
      schema: {
        params,
        response: {
          200: attachmentCompleteResponseSchema,
          400: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request) => {
      const now = new Date();
      const lease = await database.attachment.updateMany({
        where: {
          id: request.params.id,
          ownerProfileId: request.profile!.userId,
          postId: null,
          status: "PENDING",
          expiresAt: { gt: now },
        },
        data: { status: "PROCESSING", processingStartedAt: now },
      });
      if (lease.count !== 1) {
        const found = await database.attachment.findUnique({
          where: { id: request.params.id },
        });
        if (!found)
          throw new AppError(
            404,
            "ATTACHMENT_NOT_FOUND",
            "Attachment not found.",
          );
        if (found.ownerProfileId !== request.profile!.userId)
          throw new AppError(
            403,
            "ATTACHMENT_FORBIDDEN",
            "You do not own this attachment.",
          );
        throw new AppError(
          409,
          "ATTACHMENT_STATE",
          "Attachment is not ready to process.",
        );
      }
      const attachment = await database.attachment.findUniqueOrThrow({
        where: { id: request.params.id },
      });
      const inputKey = attachment.inputStorageKey!;
      try {
        const source = await storage.read(inputKey);
        if (
          source.byteSize !== attachment.declaredByteSize ||
          source.body.length !== attachment.declaredByteSize ||
          source.contentType?.split(";", 1)[0]?.toLowerCase() !==
            attachment.declaredContentType
        ) {
          throw new AppError(
            400,
            "UNSUPPORTED_IMAGE",
            "Uploaded size or content type does not match the declaration.",
          );
        }
        const normalized = await images.normalize(
          source.body,
          attachment.declaredContentType,
        );
        const outputStorageKey = `images/${attachment.id}.webp`;
        await storage.write(outputStorageKey, normalized.body, "image/webp");
        await storage.delete(inputKey);
        await database.attachment.update({
          where: { id: attachment.id },
          data: {
            status: "READY",
            inputStorageKey: null,
            outputStorageKey,
            contentType: "image/webp",
            byteSize: normalized.body.length,
            width: normalized.width,
            height: normalized.height,
            processingStartedAt: null,
          },
        });
        return {
          attachment: {
            id: attachment.id,
            status: "READY" as const,
            width: normalized.width,
            height: normalized.height,
            url: `/v1/attachments/${attachment.id}/content`,
          },
        };
      } catch (error) {
        try {
          await storage.delete(inputKey);
        } catch {
          /* cleanup retries failed rows */
        }
        await database.attachment.updateMany({
          where: { id: attachment.id },
          data: {
            status: "FAILED",
            inputStorageKey: null,
            processingStartedAt: null,
            expiresAt: now,
          },
        });
        if (error instanceof AppError) throw error;
        throw new AppError(
          500,
          "IMAGE_PROCESSING_FAILED",
          "Image processing failed.",
        );
      }
    },
  );

  server.delete(
    "/v1/attachments/:id",
    {
      preHandler: requireProfile,
      schema: {
        params,
        response: {
          204: z.null(),
          403: errorResponseSchema,
          404: errorResponseSchema,
          409: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const attachment = await database.attachment.findUnique({
        where: { id: request.params.id },
      });
      if (!attachment)
        throw new AppError(
          404,
          "ATTACHMENT_NOT_FOUND",
          "Attachment not found.",
        );
      if (attachment.ownerProfileId !== request.profile!.userId)
        throw new AppError(
          403,
          "ATTACHMENT_FORBIDDEN",
          "You do not own this attachment.",
        );
      if (attachment.postId)
        throw new AppError(
          409,
          "ATTACHMENT_STATE",
          "A claimed attachment cannot be deleted directly.",
        );
      for (const key of [
        attachment.inputStorageKey,
        attachment.outputStorageKey,
      ])
        if (key) await storage.delete(key);
      await database.attachment.delete({ where: { id: attachment.id } });
      return reply.code(204).send(null);
    },
  );

  server.get(
    "/v1/attachments/:id/content",
    {
      preHandler: requireProfile,
      schema: {
        params,
        response: {
          302: z.string(),
          403: errorResponseSchema,
          404: errorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const attachment = await database.attachment.findUnique({
        where: { id: request.params.id },
        include: { post: { select: { status: true } } },
      });
      if (
        !attachment ||
        attachment.status !== "READY" ||
        !attachment.outputStorageKey
      )
        throw new AppError(
          404,
          "ATTACHMENT_NOT_FOUND",
          "Attachment not found.",
        );
      if (attachment.postId) {
        if (attachment.post?.status !== "ACTIVE")
          throw new AppError(
            404,
            "ATTACHMENT_NOT_FOUND",
            "Attachment not found.",
          );
      } else if (attachment.ownerProfileId !== request.profile!.userId) {
        throw new AppError(
          403,
          "ATTACHMENT_FORBIDDEN",
          "You do not own this attachment.",
        );
      }
      const url = browserDownloadUrl(
        await storage.presignDownload(attachment.outputStorageKey),
      );
      return reply
        .header("Cross-Origin-Resource-Policy", "cross-origin")
        .redirect(url, 302);
    },
  );
}
