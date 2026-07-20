import {
  attachmentCompleteResponseSchema,
  attachmentUploadRequestSchema,
  attachmentUploadsResponseSchema,
  authConfigResponseSchema,
  blockResponseSchema,
  blocksResponseSchema,
  commentResponseSchema,
  commentsResponseSchema,
  createInvitationRequestSchema,
  editableProfileResponseSchema,
  feedResponseSchema,
  invitationResponseSchema,
  invitationsResponseSchema,
  meResponseSchema,
  notificationReadResponseSchema,
  notificationsReadAllResponseSchema,
  notificationsResponseSchema,
  postResponseSchema,
  profileCommentsResponseSchema,
  profileDetailsResponseSchema,
  profileMediaResponseSchema,
  profilePostsResponseSchema,
  publicAuthorResponseSchema,
  reactionResponseSchema,
  settingsResponseSchema,
  socialListResponseSchema,
  threadSubscriptionSchema,
  type AttachmentDto,
  type BlockDto,
  type CommentDto,
  type CreateCommentRequest,
  type CreatePostRequest,
  type CreateProfileRequest,
  type FeedFilter,
  type FeedMode,
  type FeedResponse,
  type InvitationDto,
  type MeResponse,
  type NotificationDto,
  type PostDto,
  type ProfileDetails,
  type ProfileMediaItem,
  type PublicAuthor,
  type ReactionResponse,
  type SettingsDto,
  type TopWindow,
  type UpdateSettingsRequest,
} from "@wakyak/contracts";
import type { ZodType } from "zod";

import { apiOrigin } from "@/lib/config";

export type {
  BlockDto,
  CommentDto,
  FeedFilter,
  FeedMode,
  InvitationDto,
  MeResponse,
  NotificationDto,
  PostDto,
  ProfileDetails,
  ProfileMediaItem,
  PublicAuthor,
  SettingsDto,
  TopWindow,
};

interface ApiErrorBody {
  error?: { code?: string; message?: string; requestId?: string };
  message?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    message: string,
    status: number,
    code?: string,
    requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

interface RequestOptions<T> extends RequestInit {
  schema: ZodType<T>;
}

function announceExpiredSession(path: string, status: number): void {
  if (status === 401 && path !== "/v1/me" && typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("wakyak:unauthenticated"));
}

async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export async function apiRequest<T>(
  path: string,
  { schema, ...init }: RequestOptions<T>,
): Promise<T> {
  const response = await fetch(resolveApiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...init.headers,
    },
  });
  const body = await responseBody(response);
  if (!response.ok) {
    announceExpiredSession(path, response.status);
    const value = (body ?? {}) as ApiErrorBody;
    throw new ApiError(
      value.error?.message ??
        value.message ??
        "The request could not be completed.",
      response.status,
      value.error?.code,
      value.error?.requestId,
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(
      "The server returned an unexpected response.",
      502,
      "INVALID_RESPONSE",
    );
  }
  return parsed.data;
}

export async function apiRequestVoid(
  path: string,
  init?: RequestInit,
): Promise<void> {
  const response = await fetch(resolveApiUrl(path), {
    ...init,
    credentials: "include",
    headers: {
      ...(init?.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...init?.headers,
    },
  });
  if (!response.ok) {
    announceExpiredSession(path, response.status);
    const value = ((await responseBody(response)) ?? {}) as ApiErrorBody;
    throw new ApiError(
      value.error?.message ??
        value.message ??
        "The request could not be completed.",
      response.status,
      value.error?.code,
      value.error?.requestId,
    );
  }
}

function query(
  path: string,
  values: Record<string, string | number | undefined>,
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== undefined) params.set(key, String(value));
  const suffix = params.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export function resolveApiUrl(value: string): string {
  if (/^https?:\/\//.test(value)) return value;
  if (value.startsWith("/__storage")) return value;
  return `${apiOrigin}${value.startsWith("/") ? value : `/${value}`}`;
}

export const api = {
  me: () => apiRequest("/v1/me", { schema: meResponseSchema }),
  adminAccess: () => apiRequestVoid("/v1/admin/access"),
  authConfig: () =>
    apiRequest("/v1/auth/config", { schema: authConfigResponseSchema }),
  redeemInvitation: (code: string) =>
    apiRequestVoid("/v1/invitations/redeem", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  createProfile: (input: CreateProfileRequest) =>
    apiRequest("/v1/profile", {
      method: "POST",
      body: JSON.stringify(input),
      schema: editableProfileResponseSchema,
    }),
  feed: (input: {
    mode: FeedMode;
    filter: FeedFilter;
    window: TopWindow;
    cursor?: string;
  }): Promise<FeedResponse> =>
    apiRequest(query("/v1/feed", { ...input, limit: 20 }), {
      schema: feedResponseSchema,
    }),
  markSeen: (postIds: string[]) =>
    apiRequestVoid("/v1/feed/seen", {
      method: "PUT",
      body: JSON.stringify({ postIds }),
      keepalive: true,
    }),
  post: async (id: string): Promise<PostDto> =>
    (
      await apiRequest(`/v1/posts/${encodeURIComponent(id)}`, {
        schema: postResponseSchema,
      })
    ).post,
  createPost: (input: CreatePostRequest) =>
    apiRequest("/v1/posts", {
      method: "POST",
      body: JSON.stringify(input),
      schema: postResponseSchema,
    }),
  comments: (postId: string, cursor?: string) =>
    apiRequest(
      query(`/v1/posts/${encodeURIComponent(postId)}/comments`, {
        cursor,
        limit: 20,
      }),
      {
        schema: commentsResponseSchema,
      },
    ),
  replies: (commentId: string, cursor?: string) =>
    apiRequest(
      query(`/v1/comments/${encodeURIComponent(commentId)}/replies`, {
        cursor,
        limit: 20,
      }),
      {
        schema: commentsResponseSchema,
      },
    ),
  createComment: (postId: string, input: CreateCommentRequest) =>
    apiRequest(`/v1/posts/${encodeURIComponent(postId)}/comments`, {
      method: "POST",
      body: JSON.stringify(input),
      schema: commentResponseSchema,
    }),
  react: (
    kind: "posts" | "comments",
    id: string,
    value: -1 | 1 | null,
  ): Promise<ReactionResponse> =>
    apiRequest(`/v1/${kind}/${encodeURIComponent(id)}/reaction`, {
      method: value === null ? "DELETE" : "PUT",
      ...(value === null ? {} : { body: JSON.stringify({ value }) }),
      schema: reactionResponseSchema,
    }),
  profile: async (id: string): Promise<ProfileDetails> =>
    (
      await apiRequest(`/v1/profiles/${encodeURIComponent(id)}`, {
        schema: profileDetailsResponseSchema,
      })
    ).profile,
  profilePosts: (id: string, cursor?: string) =>
    apiRequest(
      query(`/v1/profiles/${encodeURIComponent(id)}/posts`, {
        cursor,
        limit: 20,
      }),
      { schema: profilePostsResponseSchema },
    ),
  profileComments: (id: string, cursor?: string) =>
    apiRequest(
      query(`/v1/profiles/${encodeURIComponent(id)}/comments`, {
        cursor,
        limit: 20,
      }),
      { schema: profileCommentsResponseSchema },
    ),
  profileMedia: (id: string, cursor?: string) =>
    apiRequest(
      query(`/v1/profiles/${encodeURIComponent(id)}/media`, {
        cursor,
        limit: 20,
      }),
      { schema: profileMediaResponseSchema },
    ),
  follow: async (handle: string): Promise<PublicAuthor> =>
    (
      await apiRequest(`/v1/follows/${encodeURIComponent(handle)}`, {
        method: "PUT",
        schema: publicAuthorResponseSchema,
      })
    ).profile,
  unfollow: (handle: string) =>
    apiRequestVoid(`/v1/follows/${encodeURIComponent(handle)}`, {
      method: "DELETE",
    }),
  socialList: async (kind: "followers" | "following") =>
    (await apiRequest(`/v1/me/${kind}`, { schema: socialListResponseSchema }))
      .profiles,
  block: async (input: {
    sourceType: "post" | "comment" | "notification" | "profile";
    sourceId: string;
  }): Promise<BlockDto> =>
    (
      await apiRequest("/v1/blocks", {
        method: "PUT",
        body: JSON.stringify(input),
        schema: blockResponseSchema,
      })
    ).block,
  blocks: async (): Promise<BlockDto[]> =>
    (await apiRequest("/v1/me/blocks", { schema: blocksResponseSchema }))
      .blocks,
  unblock: (blockId: string) =>
    apiRequestVoid(`/v1/blocks/${encodeURIComponent(blockId)}`, {
      method: "DELETE",
    }),
  notifications: (state: "all" | "unread", cursor?: string) =>
    apiRequest(query("/v1/notifications", { state, cursor, limit: 20 }), {
      schema: notificationsResponseSchema,
    }),
  readNotification: (id: string) =>
    apiRequest(`/v1/notifications/${encodeURIComponent(id)}/read`, {
      method: "PUT",
      schema: notificationReadResponseSchema,
    }),
  readAllNotifications: () =>
    apiRequest("/v1/notifications/read-all", {
      method: "PUT",
      schema: notificationsReadAllResponseSchema,
    }),
  settings: async (): Promise<SettingsDto> =>
    (await apiRequest("/v1/settings", { schema: settingsResponseSchema }))
      .settings,
  updateSettings: async (input: UpdateSettingsRequest): Promise<SettingsDto> =>
    (
      await apiRequest("/v1/settings", {
        method: "PATCH",
        body: JSON.stringify(input),
        schema: settingsResponseSchema,
      })
    ).settings,
  subscription: (postId: string) =>
    apiRequest(`/v1/posts/${encodeURIComponent(postId)}/subscription`, {
      schema: threadSubscriptionSchema,
    }),
  updateSubscription: (postId: string, enabled: boolean) =>
    apiRequest(`/v1/posts/${encodeURIComponent(postId)}/subscription`, {
      method: "PUT",
      body: JSON.stringify({ enabled }),
      schema: threadSubscriptionSchema,
    }),
  invitations: (cursor?: string) =>
    apiRequest(query("/v1/admin/invitations", { cursor, limit: 25 }), {
      schema: invitationsResponseSchema,
    }),
  createInvitation: async (label?: string): Promise<InvitationDto> =>
    (
      await apiRequest("/v1/admin/invitations", {
        method: "POST",
        body: JSON.stringify(
          createInvitationRequestSchema.parse(label ? { label } : {}),
        ),
        schema: invitationResponseSchema,
      })
    ).invitation,
  revokeInvitation: (id: string) =>
    apiRequestVoid(`/v1/admin/invitations/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  reserveUploads: (files: { contentType: string; byteSize: number }[]) => {
    const body = attachmentUploadRequestSchema.parse({ files });
    return apiRequest("/v1/attachments/uploads", {
      method: "POST",
      body: JSON.stringify(body),
      schema: attachmentUploadsResponseSchema,
    });
  },
  putUpload: async (
    url: string,
    file: File,
    headers: Record<string, string>,
  ) => {
    const response = await fetch(resolveApiUrl(url), {
      method: "PUT",
      body: file,
      headers,
    });
    if (!response.ok)
      throw new ApiError(
        "The image upload failed.",
        response.status,
        "UPLOAD_FAILED",
      );
  },
  completeUpload: async (id: string): Promise<AttachmentDto> =>
    (
      await apiRequest(`/v1/attachments/${encodeURIComponent(id)}/complete`, {
        method: "POST",
        schema: attachmentCompleteResponseSchema,
      })
    ).attachment,
  deleteUpload: (id: string) =>
    apiRequestVoid(`/v1/attachments/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
};
