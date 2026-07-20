import { z } from "zod";

export const publicAuthorSchema = z.object({
  userId: z.string(),
  handle: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable().optional(),
});

export const editableProfileSchema = publicAuthorSchema.extend({
  bio: z.string().nullable(),
});

export const profileCountsSchema = z.object({
  posts: z.number().int().nonnegative(),
  followers: z.number().int().nonnegative(),
  following: z.number().int().nonnegative(),
});

export const wakarmaSchema = z.object({
  total: z.number().int(),
  posts: z.number().int(),
  comments: z.number().int(),
});

export const profileDetailsSchema = editableProfileSchema.extend({
  counts: profileCountsSchema,
  wakarma: wakarmaSchema,
  viewerIsFollowing: z.boolean(),
});

export const authUserSchema = z.object({
  id: z.string(),
  email: z.email(),
  emailVerified: z.boolean(),
});

export const meResponseSchema = z.object({
  user: authUserSchema,
  profile: editableProfileSchema.nullable(),
});
export const publicAuthorResponseSchema = z.object({
  profile: publicAuthorSchema,
});

export const authConfigResponseSchema = z.object({
  googleEnabled: z.boolean(),
});

export const anonymousIdentitySchema = z.object({
  emoji: z.string(),
  color: z.string(),
  paletteVersion: z.string(),
});

export const attachmentSchema = z.object({
  id: z.uuid(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  url: z.string(),
});

const contentIdentity = {
  body: z.string().nullable(),
  author: publicAuthorSchema.nullable(),
  anonymousIdentity: anonymousIdentitySchema.nullable(),
  isMine: z.boolean(),
  isPostAuthor: z.boolean(),
  viewerReaction: z.union([z.literal(-1), z.literal(1)]).nullable(),
};

export const postSchema = z.object({
  id: z.uuid(),
  ...contentIdentity,
  isAnonymous: z.boolean(),
  netScore: z.number().int(),
  commentCount: z.number().int().nonnegative(),
  attachments: z.array(attachmentSchema),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const commentSchema = z.object({
  id: z.uuid(),
  postId: z.uuid(),
  parentCommentId: z.uuid().nullable(),
  depth: z.number().int().nonnegative(),
  ...contentIdentity,
  isAnonymous: z.boolean(),
  status: z.enum(["ACTIVE", "DELETED", "REMOVED"]),
  netScore: z.number().int(),
  replyCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const postResponseSchema = z.object({ post: postSchema });
export const postsResponseSchema = z.object({
  posts: z.array(postSchema),
  nextCursor: z.string().nullable(),
});
export const commentResponseSchema = z.object({ comment: commentSchema });
export const commentsResponseSchema = z.object({
  comments: z.array(commentSchema),
  nextCursor: z.string().nullable(),
});

export const blockSourceSchema = z
  .object({
    sourceType: z.enum(["post", "comment", "notification", "profile"]),
    sourceId: z.string().min(1),
  })
  .strict();
export const blockSchema = z.object({
  blockId: z.uuid(),
  createdAt: z.iso.datetime(),
  displaySnapshot: z.object({
    label: z.string(),
    emoji: z.string().nullable(),
    color: z.string().nullable(),
    paletteVersion: z.string().nullable(),
  }),
});
export const blockResponseSchema = z.object({ block: blockSchema });

export const notificationTypeSchema = z.enum([
  "MENTION",
  "DIRECT_REPLY",
  "THREAD_COMMENT",
  "NEW_FOLLOWER",
  "SCORE_MILESTONE",
  "POST_TRENDING",
  "SYSTEM",
]);

/** @deprecated Test-fixture shape. Runtime profile endpoints use profileDetailsSchema. */
export const profileSchema = publicAuthorSchema.extend({
  bio: z.string().nullable(),
  postCount: z.number().int().nonnegative(),
  followerCount: z.number().int().nonnegative(),
  followingCount: z.number().int().nonnegative(),
  totalWakarma: z.number().int(),
  postWakarma: z.number().int(),
  commentWakarma: z.number().int(),
});

export const feedModeSchema = z.enum(["hot", "new", "top", "following"]);
export const feedFilterSchema = z.enum(["all", "unread"]);
export const topWindowSchema = z.enum(["day", "week", "month", "all"]);
export const feedQuerySchema = z.object({
  mode: feedModeSchema.default("hot"),
  filter: feedFilterSchema.default("all"),
  window: topWindowSchema.default("week"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});
export const feedResponseSchema = postsResponseSchema.extend({
  posts: z.array(postSchema),
});

export const feedSeenRequestSchema = z
  .object({ postIds: z.array(z.uuid()).min(1).max(50) })
  .strict();

export const createProfileRequestSchema = z
  .object({
    userId: z.string(),
    handle: z.string(),
    displayName: z.string(),
  })
  .strict();
export const updateProfileRequestSchema = z
  .object({
    handle: z.string().optional(),
    displayName: z.string().optional(),
    avatarUrl: z.string().nullable().optional(),
    bio: z.string().nullable().optional(),
  })
  .strict();
export const createPostRequestSchema = z
  .object({
    body: z.string().nullable().optional(),
    isAnonymous: z.boolean().optional(),
    attachmentIds: z.array(z.uuid()).max(4).default([]),
  })
  .strict();
export const createCommentRequestSchema = z
  .object({
    body: z.string(),
    isAnonymous: z.boolean().optional(),
    parentCommentId: z.uuid().nullable().optional(),
  })
  .strict();
export const reactionRequestSchema = z
  .object({ value: z.union([z.literal(-1), z.literal(1)]) })
  .strict();

const notificationBase = {
  id: z.uuid(),
  postId: z.uuid().nullable(),
  commentId: z.uuid().nullable(),
  readAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
};

export const identifiedNotificationActorSchema = z.object({
  kind: z.literal("identified"),
  profile: publicAuthorSchema,
});
export const anonymousNotificationActorSchema = z.object({
  kind: z.literal("anonymous"),
  identity: anonymousIdentitySchema,
});
export const notificationActorSchema = z.discriminatedUnion("kind", [
  identifiedNotificationActorSchema,
  anonymousNotificationActorSchema,
]);
const conversationPayloadSchema = z.object({
  actor: notificationActorSchema,
  excerpt: z.string(),
});
export const notificationSchema = z.discriminatedUnion("type", [
  z.object({
    ...notificationBase,
    type: z.enum(["MENTION", "DIRECT_REPLY", "THREAD_COMMENT"]),
    payload: conversationPayloadSchema,
  }),
  z.object({
    ...notificationBase,
    type: z.literal("NEW_FOLLOWER"),
    payload: z.object({ actor: identifiedNotificationActorSchema }),
  }),
  z.object({
    ...notificationBase,
    type: z.literal("SCORE_MILESTONE"),
    payload: z.object({
      threshold: z.number().int().positive(),
      excerpt: z.string(),
    }),
  }),
  z.object({
    ...notificationBase,
    type: z.literal("POST_TRENDING"),
    payload: z.object({ excerpt: z.string() }),
  }),
  z.object({
    ...notificationBase,
    type: z.literal("SYSTEM"),
    payload: z.object({ message: z.string() }),
  }),
]);
export const notificationsResponseSchema = z.object({
  notifications: z.array(notificationSchema),
  nextCursor: z.string().nullable(),
});
export const notificationsQuerySchema = z.object({
  state: z.enum(["all", "unread"]).default("all"),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});

export const settingsSchema = z.object({
  notifyMentions: z.boolean(),
  notifyDirectReplies: z.boolean(),
  notifyThreadComments: z.boolean(),
  notifyNewFollowers: z.boolean(),
  notifyScoreMilestones: z.boolean(),
  notifyPostTrending: z.boolean(),
  defaultPostAnonymous: z.boolean(),
  defaultReplyAnonymous: z.boolean(),
});
export const updateSettingsRequestSchema = settingsSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one setting is required.",
  });

export const threadSubscriptionSchema = z.object({ enabled: z.boolean() });
export const threadSubscriptionRequestSchema =
  threadSubscriptionSchema.strict();
export const settingsResponseSchema = z.object({ settings: settingsSchema });
export const socialListResponseSchema = z.object({
  profiles: z.array(publicAuthorSchema),
});
export const blocksResponseSchema = z.object({
  blocks: z.array(blockSchema),
});

export const editableProfileResponseSchema = z.object({
  profile: editableProfileSchema,
});
export const profileDetailsResponseSchema = z.object({
  profile: profileDetailsSchema,
});
export const profilePostsResponseSchema = postsResponseSchema;
export const profileCommentsResponseSchema = commentsResponseSchema;
export const profileMediaItemSchema = attachmentSchema.extend({
  postId: z.uuid(),
});
export const profileMediaResponseSchema = z.object({
  attachments: z.array(profileMediaItemSchema),
  nextCursor: z.string().nullable(),
});
export const reactionResponseSchema = z.object({
  viewerReaction: z.union([z.literal(-1), z.literal(1)]).nullable(),
  netScore: z.number().int(),
});
export const notificationReadResponseSchema = z.object({
  readAt: z.iso.datetime(),
});
export const notificationsReadAllResponseSchema =
  notificationReadResponseSchema.extend({
    count: z.number().int().nonnegative(),
  });
export const invitationRedeemRequestSchema = z
  .object({ code: z.string().min(1).max(40) })
  .strict();
export const invitationStatusSchema = z.enum([
  "ACTIVE",
  "USED",
  "REVOKED",
  "EXPIRED",
]);
export const invitationSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  label: z.string().nullable(),
  status: invitationStatusSchema,
  createdAt: z.iso.datetime(),
  expiresAt: z.iso.datetime(),
  consumedAt: z.iso.datetime().nullable(),
  revokedAt: z.iso.datetime().nullable(),
});
export const createInvitationRequestSchema = z
  .object({ label: z.string().trim().min(1).max(80).optional() })
  .strict();
export const invitationResponseSchema = z.object({
  invitation: invitationSchema,
});
export const invitationsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
});
export const invitationsResponseSchema = z.object({
  invitations: z.array(invitationSchema),
  nextCursor: z.string().nullable(),
});
export const supportedImageTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/gif",
  "image/heic",
  "image/heif",
]);
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const attachmentUploadRequestSchema = z.object({
  files: z
    .array(
      z.object({
        contentType: supportedImageTypeSchema,
        byteSize: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
      }),
    )
    .min(1)
    .max(4),
});
export const attachmentUploadSchema = z.object({
  id: z.uuid(),
  uploadUrl: z.string(),
  expiresAt: z.iso.datetime(),
  headers: z.record(z.string(), z.string()),
});
export const attachmentUploadsResponseSchema = z.object({
  uploads: z.array(attachmentUploadSchema),
});
export const attachmentCompleteResponseSchema = z.object({
  attachment: z.object({
    id: z.uuid(),
    status: z.literal("READY"),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    url: z.string(),
  }),
});

export type PostDto = z.infer<typeof postSchema>;
export type CommentDto = z.infer<typeof commentSchema>;
export type AttachmentDto = z.infer<typeof attachmentSchema>;
export type PublicAuthor = z.infer<typeof publicAuthorSchema>;
export type EditableProfile = z.infer<typeof editableProfileSchema>;
export type ProfileDetails = z.infer<typeof profileDetailsSchema>;
export type AuthUser = z.infer<typeof authUserSchema>;
export type MeResponse = z.infer<typeof meResponseSchema>;
export type AnonymousIdentity = z.infer<typeof anonymousIdentitySchema>;
export type ProfileDto = z.infer<typeof profileSchema>;
export type FeedMode = z.infer<typeof feedModeSchema>;
export type FeedFilter = z.infer<typeof feedFilterSchema>;
export type TopWindow = z.infer<typeof topWindowSchema>;
export type FeedResponse = z.infer<typeof feedResponseSchema>;
export type NotificationDto = z.infer<typeof notificationSchema>;
export type NotificationActor = z.infer<typeof notificationActorSchema>;
export type NotificationType = z.infer<typeof notificationTypeSchema>;
export type SettingsDto = z.infer<typeof settingsSchema>;
export type ThreadSubscriptionDto = z.infer<typeof threadSubscriptionSchema>;
export type BlockDto = z.infer<typeof blockSchema>;
export type ReactionResponse = z.infer<typeof reactionResponseSchema>;
export type ProfileMediaItem = z.infer<typeof profileMediaItemSchema>;
export type CreateProfileRequest = z.infer<typeof createProfileRequestSchema>;
export type UpdateProfileRequest = z.infer<typeof updateProfileRequestSchema>;
export type CreatePostRequest = z.infer<typeof createPostRequestSchema>;
export type CreateCommentRequest = z.infer<typeof createCommentRequestSchema>;
export type UpdateSettingsRequest = z.infer<typeof updateSettingsRequestSchema>;
export type InvitationDto = z.infer<typeof invitationSchema>;
export type InvitationStatus = z.infer<typeof invitationStatusSchema>;
export type CreateInvitationRequest = z.infer<
  typeof createInvitationRequestSchema
>;
