CREATE TYPE "InvitationStatus" AS ENUM ('ACTIVE', 'USED', 'REVOKED', 'EXPIRED');
CREATE TYPE "NotificationType" AS ENUM ('MENTION', 'DIRECT_REPLY', 'THREAD_COMMENT', 'NEW_FOLLOWER', 'SCORE_MILESTONE', 'POST_TRENDING', 'SYSTEM');
CREATE TYPE "OutboxStatus" AS ENUM ('AVAILABLE', 'PROCESSING', 'PROCESSED', 'FAILED');
CREATE TYPE "ScheduledJobStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

ALTER TABLE "Profile" ADD COLUMN "avatarUrl" TEXT, ADD COLUMN "bio" TEXT;
ALTER TABLE "Invitation" ADD COLUMN "expiresAt" TIMESTAMP(3), ADD COLUMN "status" "InvitationStatus" NOT NULL DEFAULT 'ACTIVE';
UPDATE "Invitation" SET "expiresAt" = "createdAt" + INTERVAL '30 days';
UPDATE "Invitation" SET "status" = CASE WHEN "revokedAt" IS NOT NULL THEN 'REVOKED'::"InvitationStatus" WHEN "consumedAt" IS NOT NULL THEN 'USED'::"InvitationStatus" WHEN "expiresAt" <= CURRENT_TIMESTAMP THEN 'EXPIRED'::"InvitationStatus" ELSE 'ACTIVE'::"InvitationStatus" END;
ALTER TABLE "Invitation" ALTER COLUMN "expiresAt" SET NOT NULL;
DROP INDEX "Invitation_revokedAt_consumedAt_createdAt_id_idx";
CREATE INDEX "Invitation_status_expiresAt_createdAt_id_idx" ON "Invitation"("status", "expiresAt", "createdAt", "id");
CREATE INDEX "Profile_handle_idx" ON "Profile"("handle");

CREATE TABLE "Follow" (
  "id" TEXT NOT NULL, "followerProfileId" TEXT NOT NULL, "followingProfileId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Follow_pkey" PRIMARY KEY ("id"), CONSTRAINT "Follow_not_self_check" CHECK ("followerProfileId" <> "followingProfileId")
);
CREATE UNIQUE INDEX "Follow_followerProfileId_followingProfileId_key" ON "Follow"("followerProfileId", "followingProfileId");
CREATE INDEX "Follow_followingProfileId_createdAt_id_idx" ON "Follow"("followingProfileId", "createdAt", "id");

CREATE TABLE "Block" (
  "id" TEXT NOT NULL, "blockerProfileId" TEXT NOT NULL, "blockedProfileId" TEXT NOT NULL,
  "displaySnapshot" JSONB NOT NULL, "sourceType" TEXT NOT NULL, "sourceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Block_pkey" PRIMARY KEY ("id"), CONSTRAINT "Block_not_self_check" CHECK ("blockerProfileId" <> "blockedProfileId")
);
CREATE UNIQUE INDEX "Block_blockerProfileId_blockedProfileId_key" ON "Block"("blockerProfileId", "blockedProfileId");
CREATE INDEX "Block_blockedProfileId_createdAt_id_idx" ON "Block"("blockedProfileId", "createdAt", "id");

CREATE TABLE "FeedState" (
  "profileId" TEXT NOT NULL, "checkpoint" TIMESTAMP(3), "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FeedState_pkey" PRIMARY KEY ("profileId")
);

CREATE TABLE "ProfileSettings" (
  "profileId" TEXT NOT NULL, "notifyMentions" BOOLEAN NOT NULL DEFAULT true,
  "notifyDirectReplies" BOOLEAN NOT NULL DEFAULT true, "notifyThreadComments" BOOLEAN NOT NULL DEFAULT true,
  "notifyNewFollowers" BOOLEAN NOT NULL DEFAULT true, "notifyScoreMilestones" BOOLEAN NOT NULL DEFAULT true,
  "notifyPostTrending" BOOLEAN NOT NULL DEFAULT true, "defaultPostAnonymous" BOOLEAN NOT NULL DEFAULT true,
  "defaultReplyAnonymous" BOOLEAN NOT NULL DEFAULT true, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "ProfileSettings_pkey" PRIMARY KEY ("profileId")
);

CREATE TABLE "ThreadSubscription" (
  "id" TEXT NOT NULL, "profileId" TEXT NOT NULL, "postId" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ThreadSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ThreadSubscription_profileId_postId_key" ON "ThreadSubscription"("profileId", "postId");
CREATE INDEX "ThreadSubscription_postId_enabled_idx" ON "ThreadSubscription"("postId", "enabled");

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL, "recipientProfileId" TEXT NOT NULL, "actorProfileId" TEXT, "type" "NotificationType" NOT NULL,
  "postId" TEXT, "commentId" TEXT, "payload" JSONB NOT NULL, "dedupeKey" TEXT NOT NULL, "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
CREATE INDEX "Notification_recipientProfileId_createdAt_id_idx" ON "Notification"("recipientProfileId", "createdAt", "id");
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

CREATE TABLE "OutboxEvent" (
  "id" TEXT NOT NULL, "type" TEXT NOT NULL, "payload" JSONB NOT NULL, "dedupeKey" TEXT NOT NULL,
  "status" "OutboxStatus" NOT NULL DEFAULT 'AVAILABLE', "attempts" INTEGER NOT NULL DEFAULT 0,
  "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "lockedAt" TIMESTAMP(3), "lockedBy" TEXT,
  "lastError" TEXT, "processedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OutboxEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OutboxEvent_dedupeKey_key" ON "OutboxEvent"("dedupeKey");
CREATE INDEX "OutboxEvent_status_availableAt_createdAt_idx" ON "OutboxEvent"("status", "availableAt", "createdAt");

CREATE TABLE "PostMilestone" (
  "id" TEXT NOT NULL, "postId" TEXT NOT NULL, "threshold" INTEGER NOT NULL, "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostMilestone_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PostMilestone_postId_threshold_key" ON "PostMilestone"("postId", "threshold");

CREATE TABLE "PostTrendAward" (
  "postId" TEXT NOT NULL, "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PostTrendAward_pkey" PRIMARY KEY ("postId")
);

CREATE TABLE "ScheduledJobRun" (
  "id" TEXT NOT NULL, "jobKey" TEXT NOT NULL, "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status" "ScheduledJobStatus" NOT NULL DEFAULT 'RUNNING', "lockedBy" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "completedAt" TIMESTAMP(3), "error" TEXT,
  CONSTRAINT "ScheduledJobRun_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ScheduledJobRun_jobKey_scheduledFor_key" ON "ScheduledJobRun"("jobKey", "scheduledFor");
CREATE INDEX "ScheduledJobRun_status_startedAt_idx" ON "ScheduledJobRun"("status", "startedAt");

ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followerProfileId_fkey" FOREIGN KEY ("followerProfileId") REFERENCES "Profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Follow" ADD CONSTRAINT "Follow_followingProfileId_fkey" FOREIGN KEY ("followingProfileId") REFERENCES "Profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockerProfileId_fkey" FOREIGN KEY ("blockerProfileId") REFERENCES "Profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Block" ADD CONSTRAINT "Block_blockedProfileId_fkey" FOREIGN KEY ("blockedProfileId") REFERENCES "Profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedState" ADD CONSTRAINT "FeedState_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfileSettings" ADD CONSTRAINT "ProfileSettings_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThreadSubscription" ADD CONSTRAINT "ThreadSubscription_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ThreadSubscription" ADD CONSTRAINT "ThreadSubscription_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientProfileId_fkey" FOREIGN KEY ("recipientProfileId") REFERENCES "Profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorProfileId_fkey" FOREIGN KEY ("actorProfileId") REFERENCES "Profile"("userId") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostMilestone" ADD CONSTRAINT "PostMilestone_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PostTrendAward" ADD CONSTRAINT "PostTrendAward_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "FeedState" ("profileId", "updatedAt") SELECT "userId", CURRENT_TIMESTAMP FROM "Profile" ON CONFLICT DO NOTHING;
INSERT INTO "ProfileSettings" ("profileId", "updatedAt") SELECT "userId", CURRENT_TIMESTAMP FROM "Profile" ON CONFLICT DO NOTHING;
INSERT INTO "ThreadSubscription" ("id", "profileId", "postId", "updatedAt")
SELECT gen_random_uuid()::text, participant."profileId", participant."postId", CURRENT_TIMESTAMP
FROM (
  SELECT "authorProfileId" AS "profileId", "id" AS "postId" FROM "Post" WHERE "authorProfileId" IS NOT NULL
  UNION
  SELECT "authorProfileId" AS "profileId", "postId" FROM "Comment" WHERE "authorProfileId" IS NOT NULL
) participant ON CONFLICT DO NOTHING;
