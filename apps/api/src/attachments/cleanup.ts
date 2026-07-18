import type { PrismaClient } from "@wakyak/database";
import type { FastifyBaseLogger } from "fastify";

import type { ObjectStorage } from "./storage.js";

export async function cleanupAttachments(
  database: PrismaClient,
  storage: ObjectStorage,
  logger: FastifyBaseLogger,
): Promise<void> {
  const now = new Date();
  const stale = new Date(now.getTime() - 5 * 60_000);
  await database.attachment.updateMany({
    where: { status: "PROCESSING", processingStartedAt: { lt: stale } },
    data: { status: "FAILED", processingStartedAt: null },
  });
  const rows = await database.attachment.findMany({
    where: {
      OR: [
        { postId: null, expiresAt: { lte: now } },
        { status: "FAILED" },
        { post: { status: { not: "ACTIVE" } } },
      ],
    },
    select: { id: true, inputStorageKey: true, outputStorageKey: true },
    take: 100,
  });
  for (const attachment of rows) {
    for (const key of [
      attachment.inputStorageKey,
      attachment.outputStorageKey,
    ]) {
      if (!key) continue;
      try {
        await storage.delete(key);
      } catch (error) {
        logger.warn(
          { err: error, attachmentId: attachment.id },
          "Attachment object cleanup failed",
        );
      }
    }
    await database.attachment.deleteMany({ where: { id: attachment.id } });
  }
}
