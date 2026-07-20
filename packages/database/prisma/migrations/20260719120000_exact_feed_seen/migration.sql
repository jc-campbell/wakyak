-- Exact per-post seen state replaces the global timestamp checkpoint. A
-- timestamp cannot represent visibility when ranked feeds reorder content.
DROP TABLE IF EXISTS "FeedState";

CREATE TABLE "FeedSeen" (
    "profileId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedSeen_pkey" PRIMARY KEY ("profileId", "postId")
);

CREATE INDEX "FeedSeen_postId_firstSeenAt_idx" ON "FeedSeen"("postId", "firstSeenAt");

ALTER TABLE "FeedSeen" ADD CONSTRAINT "FeedSeen_profileId_fkey"
FOREIGN KEY ("profileId") REFERENCES "Profile"("userId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FeedSeen" ADD CONSTRAINT "FeedSeen_postId_fkey"
FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
