import { Prisma, type PrismaClient } from "@wakyak/database";

import { hotRank } from "../content/ranking.js";

export async function deleteAccountContent(
  database: PrismaClient,
  authUserId: string,
): Promise<void> {
  await database.$transaction(async (tx) => {
    const profile = await tx.profile.findUnique({
      where: { authUserId },
      select: { userId: true },
    });
    if (!profile) return;

    const reactions = await tx.reaction.findMany({
      where: { profileId: profile.userId },
      select: { postId: true, commentId: true },
    });
    const postIds = [
      ...new Set(
        reactions.flatMap((item) => (item.postId ? [item.postId] : [])),
      ),
    ];
    const commentIds = [
      ...new Set(
        reactions.flatMap((item) => (item.commentId ? [item.commentId] : [])),
      ),
    ];
    for (const postId of postIds.sort()) {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Post" WHERE "id" = ${postId} FOR UPDATE`,
      );
    }
    for (const commentId of commentIds.sort()) {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "Comment" WHERE "id" = ${commentId} FOR UPDATE`,
      );
    }
    await tx.reaction.deleteMany({ where: { profileId: profile.userId } });

    for (const postId of postIds) {
      const post = await tx.post.findUnique({
        where: { id: postId },
        select: { createdAt: true },
      });
      if (!post) continue;
      const upvoteCount = await tx.reaction.count({
        where: { postId, value: 1 },
      });
      const downvoteCount = await tx.reaction.count({
        where: { postId, value: -1 },
      });
      const netScore = upvoteCount - downvoteCount;
      await tx.post.update({
        where: { id: postId },
        data: {
          upvoteCount,
          downvoteCount,
          netScore,
          hotRank: hotRank(netScore, post.createdAt),
        },
      });
    }
    for (const commentId of commentIds) {
      const upvoteCount = await tx.reaction.count({
        where: { commentId, value: 1 },
      });
      const downvoteCount = await tx.reaction.count({
        where: { commentId, value: -1 },
      });
      await tx.comment.updateMany({
        where: { id: commentId },
        data: {
          upvoteCount,
          downvoteCount,
          netScore: upvoteCount - downvoteCount,
        },
      });
    }

    const authoredComments = await tx.comment.findMany({
      where: { authorProfileId: profile.userId, status: "ACTIVE" },
      select: { id: true, postId: true, parentCommentId: true },
    });
    for (const comment of authoredComments) {
      await tx.post.updateMany({
        where: {
          id: comment.postId,
          status: "ACTIVE",
          commentCount: { gt: 0 },
        },
        data: { commentCount: { decrement: 1 } },
      });
      if (comment.parentCommentId) {
        await tx.comment.updateMany({
          where: { id: comment.parentCommentId, replyCount: { gt: 0 } },
          data: { replyCount: { decrement: 1 } },
        });
      }
    }
    const now = new Date();
    await tx.comment.updateMany({
      where: { authorProfileId: profile.userId, status: "ACTIVE" },
      data: { status: "DELETED", body: null, deletedAt: now },
    });
    const authoredPosts = await tx.post.findMany({
      where: { authorProfileId: profile.userId, status: "ACTIVE" },
      select: { id: true },
    });
    const authoredPostIds = authoredPosts.map((item) => item.id);
    await tx.post.updateMany({
      where: { id: { in: authoredPostIds } },
      data: { status: "DELETED", body: null, deletedAt: now, commentCount: 0 },
    });
    await tx.attachment.updateMany({
      where: {
        OR: [
          { ownerProfileId: profile.userId },
          { postId: { in: authoredPostIds } },
        ],
      },
      data: { expiresAt: now },
    });
  });
}
