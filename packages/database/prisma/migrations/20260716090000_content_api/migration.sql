-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('ACTIVE', 'DELETED', 'REMOVED');
CREATE TYPE "AttachmentStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- Existing profiles are grandfathered; timestamps are backfilled before the
-- updatedAt default is removed so Prisma remains responsible for later writes.
ALTER TABLE "Profile"
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Profile" ALTER COLUMN "updatedAt" DROP DEFAULT;

CREATE TABLE "Invitation" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "consumedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Invitation_label_length_check" CHECK ("label" IS NULL OR char_length("label") <= 80),
  CONSTRAINT "Invitation_code_check" CHECK ("code" ~ '^[0-9A-HJKMNP-TV-Z]{16}$'),
  CONSTRAINT "Invitation_state_check" CHECK (NOT ("consumedAt" IS NOT NULL AND "revokedAt" IS NOT NULL))
);

ALTER TABLE "user" ADD COLUMN "invitationId" TEXT;

CREATE TABLE "Post" (
  "id" TEXT NOT NULL,
  "authorProfileId" TEXT,
  "body" TEXT,
  "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
  "status" "ContentStatus" NOT NULL DEFAULT 'ACTIVE',
  "upvoteCount" INTEGER NOT NULL DEFAULT 0,
  "downvoteCount" INTEGER NOT NULL DEFAULT 0,
  "netScore" INTEGER NOT NULL DEFAULT 0,
  "commentCount" INTEGER NOT NULL DEFAULT 0,
  "hotRank" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "removedAt" TIMESTAMP(3),
  "removedByProfileId" TEXT,
  CONSTRAINT "Post_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Post_counts_check" CHECK (
    "upvoteCount" >= 0 AND "downvoteCount" >= 0 AND "commentCount" >= 0
    AND "netScore" = "upvoteCount" - "downvoteCount"
  ),
  CONSTRAINT "Post_active_body_check" CHECK ("status" <> 'ACTIVE' OR "body" IS NULL OR char_length("body") > 0),
  CONSTRAINT "Post_status_timestamp_check" CHECK (
    ("status" = 'ACTIVE' AND "deletedAt" IS NULL AND "removedAt" IS NULL)
    OR ("status" = 'DELETED' AND "deletedAt" IS NOT NULL AND "removedAt" IS NULL)
    OR ("status" = 'REMOVED' AND "removedAt" IS NOT NULL)
  )
);

CREATE TABLE "Comment" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "authorProfileId" TEXT,
  "parentCommentId" TEXT,
  "parentPostId" TEXT,
  "depth" INTEGER NOT NULL DEFAULT 0,
  "body" TEXT,
  "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
  "status" "ContentStatus" NOT NULL DEFAULT 'ACTIVE',
  "upvoteCount" INTEGER NOT NULL DEFAULT 0,
  "downvoteCount" INTEGER NOT NULL DEFAULT 0,
  "netScore" INTEGER NOT NULL DEFAULT 0,
  "replyCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "removedAt" TIMESTAMP(3),
  "removedByProfileId" TEXT,
  CONSTRAINT "Comment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Comment_counts_check" CHECK (
    "depth" >= 0 AND "upvoteCount" >= 0 AND "downvoteCount" >= 0 AND "replyCount" >= 0
    AND "netScore" = "upvoteCount" - "downvoteCount"
  ),
  CONSTRAINT "Comment_parent_check" CHECK (
    ("parentCommentId" IS NULL AND "parentPostId" IS NULL AND "depth" = 0)
    OR ("parentCommentId" IS NOT NULL AND "parentPostId" = "postId" AND "depth" > 0)
  ),
  CONSTRAINT "Comment_active_body_check" CHECK ("status" <> 'ACTIVE' OR ("body" IS NOT NULL AND char_length("body") > 0)),
  CONSTRAINT "Comment_status_timestamp_check" CHECK (
    ("status" = 'ACTIVE' AND "deletedAt" IS NULL AND "removedAt" IS NULL)
    OR ("status" = 'DELETED' AND "deletedAt" IS NOT NULL AND "removedAt" IS NULL)
    OR ("status" = 'REMOVED' AND "removedAt" IS NOT NULL)
  )
);

CREATE TABLE "Reaction" (
  "id" TEXT NOT NULL,
  "profileId" TEXT NOT NULL,
  "postId" TEXT,
  "commentId" TEXT,
  "value" SMALLINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Reaction_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Reaction_value_check" CHECK ("value" IN (-1, 1)),
  CONSTRAINT "Reaction_target_check" CHECK (num_nonnulls("postId", "commentId") = 1)
);

CREATE TABLE "Attachment" (
  "id" TEXT NOT NULL,
  "ownerProfileId" TEXT,
  "postId" TEXT,
  "inputStorageKey" TEXT,
  "outputStorageKey" TEXT,
  "declaredContentType" TEXT NOT NULL,
  "declaredByteSize" INTEGER NOT NULL,
  "contentType" TEXT,
  "byteSize" INTEGER,
  "width" INTEGER,
  "height" INTEGER,
  "order" INTEGER,
  "status" "AttachmentStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "processingStartedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Attachment_declared_size_check" CHECK ("declaredByteSize" > 0 AND "declaredByteSize" <= 10485760),
  CONSTRAINT "Attachment_dimensions_check" CHECK (
    ("width" IS NULL AND "height" IS NULL) OR ("width" > 0 AND "height" > 0)
  ),
  CONSTRAINT "Attachment_final_size_check" CHECK ("byteSize" IS NULL OR "byteSize" > 0),
  CONSTRAINT "Attachment_order_check" CHECK ("order" IS NULL OR "order" BETWEEN 0 AND 3),
  CONSTRAINT "Attachment_post_order_check" CHECK (
    ("postId" IS NULL AND "order" IS NULL) OR ("postId" IS NOT NULL AND "order" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "Invitation_code_key" ON "Invitation"("code");
CREATE INDEX "Invitation_revokedAt_consumedAt_createdAt_id_idx" ON "Invitation"("revokedAt", "consumedAt", "createdAt", "id");
CREATE UNIQUE INDEX "user_invitationId_key" ON "user"("invitationId");

CREATE INDEX "Post_status_createdAt_id_idx" ON "Post"("status", "createdAt", "id");
CREATE INDEX "Post_status_netScore_createdAt_id_idx" ON "Post"("status", "netScore", "createdAt", "id");
CREATE INDEX "Post_status_hotRank_id_idx" ON "Post"("status", "hotRank", "id");
CREATE INDEX "Post_authorProfileId_createdAt_id_idx" ON "Post"("authorProfileId", "createdAt", "id");

CREATE UNIQUE INDEX "Comment_postId_id_key" ON "Comment"("postId", "id");
CREATE INDEX "Comment_postId_parentCommentId_status_netScore_createdAt_id_idx" ON "Comment"("postId", "parentCommentId", "status", "netScore", "createdAt", "id");
CREATE INDEX "Comment_postId_parentCommentId_status_createdAt_id_idx" ON "Comment"("postId", "parentCommentId", "status", "createdAt", "id");
CREATE INDEX "Comment_parentCommentId_createdAt_id_idx" ON "Comment"("parentCommentId", "createdAt", "id");
CREATE INDEX "Comment_authorProfileId_createdAt_id_idx" ON "Comment"("authorProfileId", "createdAt", "id");

CREATE UNIQUE INDEX "Reaction_profileId_postId_key" ON "Reaction"("profileId", "postId");
CREATE UNIQUE INDEX "Reaction_profileId_commentId_key" ON "Reaction"("profileId", "commentId");
CREATE INDEX "Reaction_postId_idx" ON "Reaction"("postId");
CREATE INDEX "Reaction_commentId_idx" ON "Reaction"("commentId");

CREATE UNIQUE INDEX "Attachment_inputStorageKey_key" ON "Attachment"("inputStorageKey");
CREATE UNIQUE INDEX "Attachment_outputStorageKey_key" ON "Attachment"("outputStorageKey");
CREATE UNIQUE INDEX "Attachment_postId_order_key" ON "Attachment"("postId", "order");
CREATE INDEX "Attachment_ownerProfileId_status_createdAt_idx" ON "Attachment"("ownerProfileId", "status", "createdAt");
CREATE INDEX "Attachment_postId_order_idx" ON "Attachment"("postId", "order");
CREATE INDEX "Attachment_status_expiresAt_idx" ON "Attachment"("status", "expiresAt");

ALTER TABLE "user" ADD CONSTRAINT "user_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT "Post_authorProfileId_fkey" FOREIGN KEY ("authorProfileId") REFERENCES "Profile"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Post" ADD CONSTRAINT "Post_removedByProfileId_fkey" FOREIGN KEY ("removedByProfileId") REFERENCES "Profile"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_authorProfileId_fkey" FOREIGN KEY ("authorProfileId") REFERENCES "Profile"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentPostId_parentCommentId_fkey" FOREIGN KEY ("parentPostId", "parentCommentId") REFERENCES "Comment"("postId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_removedByProfileId_fkey" FOREIGN KEY ("removedByProfileId") REFERENCES "Profile"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Reaction" ADD CONSTRAINT "Reaction_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_ownerProfileId_fkey" FOREIGN KEY ("ownerProfileId") REFERENCES "Profile"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
